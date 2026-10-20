import { randomUUID } from 'node:crypto';
import { resendErrorSchema } from '@ats/shared';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { createWorker } from '../../src/worker/worker.js';
import {
  startTestApp,
  TEST_REDIS_URL,
  TEST_WEB_ORIGIN,
  type TestApp,
} from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';
import {
  deleteMessagesTo,
  type MailpitMessage,
  mailpitSmtp,
  messagesTo,
  RecordingLogger,
  waitForMessages,
} from './mailpit.js';

// Requesting a reset sends the email through the queue; a worker in this process delivers it to
// the Compose Mailpit (`docker compose up -d --wait postgres redis mailpit`).
const OLD_PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'new-synthetic-pass-8';
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const RESET_PAGE = `${TEST_WEB_ORIGIN}/reset-password`;
const INVALID_PAGE = `${TEST_WEB_ORIGIN}/reset-password/invalid`;
const start = new Date('2026-10-01T08:00:00.000Z');
// Tests that fake `Date` wait for each email before moving the clock (and before they end). The
// in-process worker shares the faked clock: Nodemailer times its SMTP connection with `Date.now()`,
// so a jump while an email is being sent times the attempt out, and BullMQ's retry, due 10 s later
// on the faked clock, never comes while the clock stands still.

/** A fresh synthetic address, so runs and tests never share Mailpit messages or limits. */
function uniqueEmail(name: string): string {
  return `${name}-${randomUUID()}@example.test`;
}

/** The reset link in a message: path and query of the API reset callback. */
function resetPath(message: MailpitMessage | undefined): string {
  const match = /https?:\/\/\S+?(\/api\/auth\/reset-password\/\S+)/.exec(message?.Text ?? '');
  expect(match, 'reset link in the email').not.toBeNull();
  return match?.[1] ?? '';
}

describe('password reset', () => {
  const logger = new RecordingLogger();
  let api: TestApp;
  let worker: INestApplicationContext;
  let database: Database;
  let redis: Redis;

  beforeAll(async () => {
    api = await startTestApp({}, { logger });
    worker = await createWorker(
      { nodeEnv: 'test', logLevel: 'log', redisUrl: TEST_REDIS_URL, smtp: mailpitSmtp },
      logger,
      { queuePrefix: api.redisPrefix },
    );
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    redis = new Redis(TEST_REDIS_URL);
  });

  afterAll(async () => {
    await worker.close();
    await api.close();
    await database.close();
    await redis.quit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function post(path: string, body: unknown) {
    return api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
      body: JSON.stringify(body),
    });
  }

  function requestReset(email: string) {
    return post('/api/auth/request-password-reset', { email });
  }

  function resetPassword(token: string, newPassword: string) {
    return post('/api/auth/reset-password', { token, newPassword });
  }

  function signIn(email: string, password: string) {
    return post('/api/auth/sign-in/email', { email, password });
  }

  function me(cookie: string) {
    return api.request('/api/me', { headers: { cookie } });
  }

  /** Opens a reset link the way a browser would, without following the redirect. */
  function open(path: string) {
    return api.request(path, { redirect: 'manual' });
  }

  /** Opens a link that must land on the web reset page; returns the token it carries. */
  async function tokenFrom(path: string): Promise<string> {
    const response = await open(path);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(RESET_PAGE);
    const token = location.searchParams.get('token') ?? '';
    expect(token).not.toBe('');
    return token;
  }

  /** A verified user with no mail waiting in Mailpit. */
  async function verifiedUser(email: string, locale: 'vi' | 'en' = 'vi'): Promise<void> {
    const response = await post('/api/auth/sign-up/email', {
      name: 'Minh Anh',
      email,
      password: OLD_PASSWORD,
      locale,
    });
    expect(response.status).toBe(200);
    await waitForMessages(email, 1);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    await deleteMessagesTo(email);
    // Waiting for Mailpit lets a faked clock move on; tests count from `start` again.
    if (vi.isFakeTimers()) vi.setSystemTime(start);
  }

  /** Signs in with the old password and returns the session cookie. */
  async function sessionCookie(email: string): Promise<string> {
    const response = await signIn(email, OLD_PASSWORD);
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((c) => /session_token=/.test(c));
    expect(cookie, 'session cookie').toBeDefined();
    return cookie?.split(';')[0] ?? '';
  }

  /** Mailpit holds nothing for `email` a while after the request that could have sent it. */
  async function expectNoMail(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await messagesTo(email)).toEqual([]);
  }

  describe('the email', () => {
    it('is sent once, in Vietnamese, to a user whose language is vi', async () => {
      const email = uniqueEmail('reset-vi');
      await verifiedUser(email, 'vi');

      const response = await requestReset(email);

      expect(response.status).toBe(200);
      const [message] = await waitForMessages(email, 1);
      expect(message?.Subject).toBe('Đặt lại mật khẩu ATS của bạn');
      expect(message?.Text).toContain('Xin chào Minh Anh,');
      expect(message?.Text).toContain('hết hạn sau 1 giờ');
      expect(message?.HTML).toContain('<html lang="vi">');
      expect(resetPath(message)).toMatch(/^\/api\/auth\/reset-password\/[^/?]+\?callbackURL=/);
    });

    it('is in English for a user whose language is en', async () => {
      const email = uniqueEmail('reset-en');
      await verifiedUser(email, 'en');

      expect((await requestReset(email)).status).toBe(200);

      const [message] = await waitForMessages(email, 1);
      expect(message?.Subject).toBe('Reset your ATS password');
      expect(message?.Text).toContain('Hello Minh Anh,');
      expect(message?.Text).toContain('expires in 1 hour');
      expect(message?.HTML).toContain('<html lang="en">');
    });

    it('links to the web reset page whatever redirectTo the client asks for', async () => {
      const email = uniqueEmail('reset-redirect');
      await verifiedUser(email);

      const response = await post('/api/auth/request-password-reset', {
        email,
        redirectTo: `${TEST_WEB_ORIGIN}/somewhere-else`,
      });

      expect(response.status).toBe(200);
      const [message] = await waitForMessages(email, 1);
      await tokenFrom(resetPath(message));
    });
  });

  describe('the link', () => {
    it('changes the password: the old one no longer signs in, the new one does', async () => {
      const email = uniqueEmail('reset-change');
      await verifiedUser(email);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);
      const token = await tokenFrom(resetPath(message));

      const response = await resetPassword(token, NEW_PASSWORD);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: true });
      expect((await signIn(email, OLD_PASSWORD)).status).toBe(401);
      expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('signs out every existing session of the user', async () => {
      const email = uniqueEmail('reset-sessions');
      await verifiedUser(email);
      const first = await sessionCookie(email);
      const second = await sessionCookie(email);
      expect((await me(first)).status).toBe(200);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);
      const token = await tokenFrom(resetPath(message));

      expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);

      expect((await me(first)).status).toBe(401);
      expect((await me(second)).status).toBe(401);
    });

    it('works once: used again it redirects to the invalid page and is refused', async () => {
      const email = uniqueEmail('reset-twice');
      await verifiedUser(email);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);
      const path = resetPath(message);
      const token = await tokenFrom(path);
      // Opening the link again before using it (a reload) still works.
      expect(await tokenFrom(path)).toBe(token);
      expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);

      const reopened = await open(path);
      expect(reopened.status).toBe(302);
      expect(reopened.headers.get('location')).toBe(INVALID_PAGE);

      const reused = await resetPassword(token, 'another-synthetic-pass');
      expect(reused.status).toBe(400);
      expect(await reused.json()).toMatchObject({ code: 'INVALID_TOKEN' });
      expect((await signIn(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('redirects to the invalid page after 1 hour and no longer resets', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-late');
      await verifiedUser(email);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);
      const path = resetPath(message);
      const token = await tokenFrom(path);

      vi.setSystemTime(start.getTime() + HOUR + SECOND);
      const late = await open(path);

      expect(late.status).toBe(302);
      expect(late.headers.get('location')).toBe(INVALID_PAGE);
      expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(400);
      expect((await signIn(email, OLD_PASSWORD)).status).toBe(200);
    });

    it('still works just before 1 hour', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-in-time');
      await verifiedUser(email);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);

      vi.setSystemTime(start.getTime() + HOUR - 5 * SECOND);
      const token = await tokenFrom(resetPath(message));

      expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);
    });

    it('redirects an unknown token to the invalid page', async () => {
      const response = await open(
        `/api/auth/reset-password/not-a-real-token?callbackURL=${encodeURIComponent(RESET_PAGE)}`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(INVALID_PAGE);
    });

    it('rejects a 7-character password with PASSWORD_TOO_SHORT and keeps the link usable', async () => {
      const email = uniqueEmail('reset-short');
      await verifiedUser(email);
      await requestReset(email);
      const [message] = await waitForMessages(email, 1);
      const token = await tokenFrom(resetPath(message));

      const response = await resetPassword(token, '1234567');

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
      expect((await signIn(email, OLD_PASSWORD)).status).toBe(200);
      expect((await resetPassword(token, '12345678')).status).toBe(200);
    });
  });

  describe('request limits', () => {
    it('refuses a second request within 60 s with RESEND_TOO_SOON', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-soon');
      await verifiedUser(email);
      expect((await requestReset(email)).status).toBe(200);
      await waitForMessages(email, 1);

      vi.setSystemTime(start.getTime() + 10 * SECOND);
      const refused = await requestReset(email);

      expect(refused.status).toBe(429);
      expect(refused.headers.get('retry-after')).toBe('50');
      const body: unknown = await refused.json();
      expect(body).toMatchObject({ code: 'RESEND_TOO_SOON', retryAfterSeconds: 50 });
      expect(resendErrorSchema.safeParse(body).success).toBe(true);

      vi.setSystemTime(start.getTime() + MINUTE);
      expect((await requestReset(email)).status).toBe(200);
      await waitForMessages(email, 2);
    });

    it('refuses the sixth request within an hour with RESEND_LIMIT', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-limit');
      await verifiedUser(email);
      for (let send = 0; send < 5; send += 1) {
        vi.setSystemTime(start.getTime() + send * MINUTE);
        expect((await requestReset(email)).status).toBe(200);
        await waitForMessages(email, send + 1);
      }

      vi.setSystemTime(start.getTime() + 5 * MINUTE);
      const refused = await requestReset(email);

      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({
        code: 'RESEND_LIMIT',
        retryAfterSeconds: 55 * 60,
      });
      await waitForMessages(email, 5);
    });

    it('does not share limits with the verification resend', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-separate');
      await verifiedUser(email);
      // Sign-up has just sent the verification email, so a verification resend is too soon.
      expect((await post('/api/auth/send-verification-email', { email })).status).toBe(429);

      expect((await requestReset(email)).status).toBe(200);
      await waitForMessages(email, 1);
    });

    it('makes every earlier link invalid once a new one is sent', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: start });
      const email = uniqueEmail('reset-replaced');
      await verifiedUser(email);
      await requestReset(email);
      await waitForMessages(email, 1);
      vi.setSystemTime(start.getTime() + MINUTE);
      await requestReset(email);
      await waitForMessages(email, 2);
      vi.setSystemTime(start.getTime() + 2 * MINUTE);
      await requestReset(email);
      const [first, second, third] = await waitForMessages(email, 3);

      for (const old of [first, second]) {
        const response = await open(resetPath(old));
        expect(response.headers.get('location')).toBe(INVALID_PAGE);
      }
      const token = await tokenFrom(resetPath(third));
      const rows = await database.db.execute<{ count: number }>(
        sql`select count(*)::int as count from verification where identifier like 'reset-password:%'`,
      );
      expect(rows.rows[0]?.count).toBe(1);
      expect((await resetPassword(token, NEW_PASSWORD)).status).toBe(200);
    });
  });

  describe('no account enumeration', () => {
    it('answers an unknown email like a known one and sends nothing', async () => {
      const known = uniqueEmail('reset-known');
      await verifiedUser(known);
      const unknown = uniqueEmail('reset-unknown');

      const knownResponse = await requestReset(known);
      const unknownResponse = await requestReset(unknown);

      expect(unknownResponse.status).toBe(200);
      expect(await unknownResponse.json()).toEqual(await knownResponse.json());
      // The limits apply to unknown addresses too, so a 429 reveals nothing either.
      expect((await requestReset(unknown)).status).toBe(429);
      await expectNoMail(unknown);
    });
  });

  it('keeps the address out of the logs and the Redis keys', async () => {
    const email = uniqueEmail('reset-private');
    await verifiedUser(email, 'en');
    await requestReset(email);
    await requestReset(email);
    await requestReset(uniqueEmail('reset-private-unknown'));
    await waitForMessages(email, 1);

    const keys = await redis.keys(`${api.redisPrefix}:*`);
    expect(keys.some((key) => key.includes(':reset-password:'))).toBe(true);
    expect(keys.filter((key) => key.includes('reset-private'))).toEqual([]);
    expect(logger.records.length).toBeGreaterThan(0);
    expect(JSON.stringify(logger.records)).not.toContain('reset-private');
  });
});
