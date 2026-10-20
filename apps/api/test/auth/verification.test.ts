import { randomUUID } from 'node:crypto';
import { resendErrorSchema } from '@ats/shared';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { createWorker } from '../../src/worker/worker.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';
import {
  deleteMessagesTo,
  mailpitSmtp,
  messagesTo,
  RecordingLogger,
  verificationPath,
  waitForMessages,
} from './mailpit.js';

// Sign-up sends the verification email through the queue; a worker in this process delivers it
// to the Compose Mailpit (`docker compose up -d --wait postgres redis mailpit`).
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const PASSWORD = 'correct-horse-battery-staple';
const SECOND = 1_000;
const HOUR = 60 * 60 * SECOND;
const SUCCESS_URL = `${TEST_WEB_ORIGIN}/verify-email/success`;
const EXPIRED_URL = `${TEST_WEB_ORIGIN}/verify-email/expired`;
// Tests that fake `Date` wait for each email before moving the clock. The in-process worker shares
// the faked clock: Nodemailer times its SMTP connection with `Date.now()`, so a jump while an email
// is being sent times the attempt out, and BullMQ's retry, due 10 s later on the faked clock, never
// comes while the clock stands still.

/** A fresh synthetic address, so runs and tests never share Mailpit messages or limits. */
function uniqueEmail(name: string): string {
  return `${name}-${randomUUID()}@example.test`;
}

describe('email verification on sign-up', () => {
  const logger = new RecordingLogger();
  let api: TestApp;
  let worker: INestApplicationContext;
  let database: Database;
  let redis: Redis;

  beforeAll(async () => {
    api = await startTestApp({}, { logger });
    worker = await createWorker(
      { nodeEnv: 'test', logLevel: 'log', redisUrl, smtp: mailpitSmtp },
      logger,
      { queuePrefix: api.redisPrefix },
    );
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    redis = new Redis(redisUrl);
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

  async function signUp(email: string, locale: 'vi' | 'en' = 'vi'): Promise<void> {
    const response = await post('/api/auth/sign-up/email', {
      name: 'Minh Anh',
      email,
      password: PASSWORD,
      locale,
    });
    expect(response.status).toBe(200);
  }

  function resend(email: string) {
    return post('/api/auth/send-verification-email', { email });
  }

  function signIn(email: string) {
    return post('/api/auth/sign-in/email', { email, password: PASSWORD });
  }

  /** Opens a verification link the way a browser would, without following the redirect. */
  function open(path: string) {
    return api.request(path, { redirect: 'manual' });
  }

  async function isVerified(email: string): Promise<boolean> {
    const result = await database.db.execute<{ email_verified: boolean }>(
      sql`select email_verified from "user" where email = ${email}`,
    );
    return result.rows[0]?.email_verified ?? false;
  }

  /** Mailpit holds nothing for `email` a while after the request that could have sent it. */
  async function expectNoMail(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await messagesTo(email)).toEqual([]);
  }

  describe('the email', () => {
    const email = 'new.user@example.test';

    it('is sent once, in English, to a user who signed up in English', async () => {
      await deleteMessagesTo(email);

      await signUp(email, 'en');

      const [message] = await waitForMessages(email, 1);
      expect(message?.Subject).toBe('Verify your email for ATS');
      expect(message?.Text).toContain('Hello Minh Anh,');
      expect(message?.Text).toContain('expires in 24 hours');
      expect(message?.HTML).toContain('<html lang="en">');
      expect(verificationPath(message)).toMatch(/^\/api\/auth\/verify-email\?token=/);
    });

    it('is in Vietnamese for a user who signed up in Vietnamese', async () => {
      await deleteMessagesTo(email);

      await signUp(email, 'vi');

      const [message] = await waitForMessages(email, 1);
      expect(message?.Subject).toBe('Xác minh email của bạn trên ATS');
      expect(message?.Text).toContain('Xin chào Minh Anh,');
      expect(message?.Text).toContain('hết hạn sau 24 giờ');
      expect(message?.HTML).toContain('<html lang="vi">');
    });
  });

  describe('the link', () => {
    it('verifies the user, redirects to the success page, and sign-in then works', async () => {
      const email = uniqueEmail('verify');
      await signUp(email);
      const [message] = await waitForMessages(email, 1);
      expect((await signIn(email)).status).toBe(403);

      const response = await open(verificationPath(message));

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(SUCCESS_URL);
      expect(await isVerified(email)).toBe(true);
      expect((await signIn(email)).status).toBe(200);
    });

    it('does not verify after 24 hours and redirects to the expired page', async () => {
      const signedUpAt = new Date('2026-10-01T08:00:00.000Z');
      vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
      const email = uniqueEmail('late');
      await signUp(email);
      const [message] = await waitForMessages(email, 1);

      vi.setSystemTime(signedUpAt.getTime() + 24 * HOUR + SECOND);
      const response = await open(verificationPath(message));

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(EXPIRED_URL);
      expect(await isVerified(email)).toBe(false);
    });

    it('still verifies just before 24 hours', async () => {
      const signedUpAt = new Date('2026-10-01T08:00:00.000Z');
      vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
      const email = uniqueEmail('in-time');
      await signUp(email);
      const [message] = await waitForMessages(email, 1);

      vi.setSystemTime(signedUpAt.getTime() + 24 * HOUR - 5 * SECOND);
      const response = await open(verificationPath(message));

      expect(response.headers.get('location')).toBe(SUCCESS_URL);
      expect(await isVerified(email)).toBe(true);
    });

    it('redirects a tampered token to the expired page', async () => {
      const email = uniqueEmail('tampered');
      await signUp(email);
      const [message] = await waitForMessages(email, 1);

      const response = await open(verificationPath(message).replace('token=', 'token=x'));

      expect(response.headers.get('location')).toBe(EXPIRED_URL);
      expect(await isVerified(email)).toBe(false);
    });

    it('stops working once a newer link is sent', async () => {
      const signedUpAt = new Date('2026-10-01T08:00:00.000Z');
      vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
      const email = uniqueEmail('replaced');
      await signUp(email);
      await waitForMessages(email, 1);

      vi.setSystemTime(signedUpAt.getTime() + 61 * SECOND);
      expect((await resend(email)).status).toBe(200);
      const [first, second] = await waitForMessages(email, 2);
      expect(verificationPath(first)).not.toBe(verificationPath(second));

      const old = await open(verificationPath(first));
      expect(old.headers.get('location')).toBe(EXPIRED_URL);
      expect(await isVerified(email)).toBe(false);

      const latest = await open(verificationPath(second));
      expect(latest.headers.get('location')).toBe(SUCCESS_URL);
      expect(await isVerified(email)).toBe(true);
    });
  });

  describe('resend limits', () => {
    const signedUpAt = new Date('2026-10-01T08:00:00.000Z');

    it('refuses a resend within 60 s with RESEND_TOO_SOON and sends one after 60 s', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
      const email = uniqueEmail('too-soon');
      await signUp(email);
      await waitForMessages(email, 1);

      vi.setSystemTime(signedUpAt.getTime() + 10 * SECOND);
      const refused = await resend(email);

      expect(refused.status).toBe(429);
      expect(refused.headers.get('retry-after')).toBe('50');
      const body: unknown = await refused.json();
      expect(body).toMatchObject({ code: 'RESEND_TOO_SOON', retryAfterSeconds: 50 });
      expect(resendErrorSchema.safeParse(body).success).toBe(true);

      vi.setSystemTime(signedUpAt.getTime() + 60 * SECOND);
      const allowed = await resend(email);

      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toEqual({ status: true });
      await waitForMessages(email, 2);
    });

    it('refuses the sixth send within an hour with RESEND_LIMIT', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
      const email = uniqueEmail('limit');
      await signUp(email);
      await waitForMessages(email, 1);
      for (let send = 2; send <= 5; send += 1) {
        vi.setSystemTime(signedUpAt.getTime() + (send - 1) * 60 * SECOND);
        expect((await resend(email)).status).toBe(200);
        await waitForMessages(email, send);
      }

      vi.setSystemTime(signedUpAt.getTime() + 5 * 60 * SECOND);
      const refused = await resend(email);

      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({
        code: 'RESEND_LIMIT',
        retryAfterSeconds: 55 * 60,
      });
      await waitForMessages(email, 5);
    });
  });

  describe('no account enumeration', () => {
    it('answers a resend for an unknown email like any other and sends nothing', async () => {
      const email = uniqueEmail('unknown');

      const response = await resend(email);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: true });
      // The limits apply to unknown addresses too, so a 429 reveals nothing either.
      expect((await resend(email)).status).toBe(429);
      await expectNoMail(email);
    });

    it('answers a resend for an already verified email like any other and sends nothing', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T08:00:00.000Z') });
      const email = uniqueEmail('verified');
      await signUp(email);
      const [message] = await waitForMessages(email, 1);
      await open(verificationPath(message));
      expect(await isVerified(email)).toBe(true);
      await deleteMessagesTo(email);

      vi.setSystemTime(new Date('2026-10-01T09:00:00.000Z'));
      const response = await resend(email);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: true });
      await expectNoMail(email);
    });
  });

  it('keeps the address out of the logs and the Redis keys', async () => {
    const signedUpAt = new Date('2026-10-01T08:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'], now: signedUpAt });
    const email = uniqueEmail('private');
    await signUp(email, 'en');
    await waitForMessages(email, 1);
    expect((await resend(email)).status).toBe(429);
    vi.setSystemTime(signedUpAt.getTime() + 61 * SECOND);
    expect((await resend(email)).status).toBe(200);
    const [, latest] = await waitForMessages(email, 2);
    await open(verificationPath(latest));

    const keys = await redis.keys(`${api.redisPrefix}:*`);
    expect(keys.some((key) => key.includes(':verify-email:'))).toBe(true);
    const localPart = email.split('@')[0] ?? email;
    expect(keys.filter((key) => key.includes(localPart))).toEqual([]);
    expect(logger.records.length).toBeGreaterThan(0);
    expect(JSON.stringify(logger.records)).not.toContain(localPart);
  });
});
