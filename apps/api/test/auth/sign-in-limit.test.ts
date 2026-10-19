import { inspect } from 'node:util';
import { SIGN_IN_RATE_LIMITED, signInRateLimitedErrorSchema } from '@ats/shared';
import type { LoggerService } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import {
  startTestApp,
  TEST_WEB_ORIGIN,
  TEST_REDIS_URL,
  type TestApp,
} from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

// Issue #83: after 10 failed email sign-ins in 15 minutes for the same IP + email, further attempts
// are refused with 429 SIGN_IN_RATE_LIMITED, before the password is checked (decisions §2).
const EMAIL = 'someone@example.test';
const PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'wrong-password-123';
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.4';
const WINDOW_MS = 15 * 60 * 1000;

/** Keeps every log call so tests can check what was written. */
class RecordingLogger implements LoggerService {
  readonly lines: string[] = [];
  log(...args: unknown[]) {
    this.record(args);
  }
  error(...args: unknown[]) {
    this.record(args);
  }
  warn(...args: unknown[]) {
    this.record(args);
  }
  debug(...args: unknown[]) {
    this.record(args);
  }
  verbose(...args: unknown[]) {
    this.record(args);
  }
  fatal(...args: unknown[]) {
    this.record(args);
  }
  private record(args: unknown[]) {
    this.lines.push(args.map((arg) => inspect(arg, { depth: 10 })).join(' '));
  }
}

describe('failed sign-in limit per IP and email', () => {
  let api: TestApp;
  let database: Database;
  let redis: Redis;
  const logger = new RecordingLogger();

  beforeAll(async () => {
    // Behind Caddy in production: the client IP comes from X-Forwarded-For.
    api = await startTestApp({ trustProxy: true }, { logger });
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    redis = new Redis(TEST_REDIS_URL);
  });

  afterAll(async () => {
    await api.close();
    await database.close();
    await redis.quit();
  });

  beforeEach(async () => {
    const keys = await limitKeys();
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await signUpVerified(EMAIL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function limitKeys(): Promise<string[]> {
    return redis.keys(`${api.redisPrefix}:sign-in-limit:*`);
  }

  function post(path: string, body: unknown, ip: string) {
    return api.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_WEB_ORIGIN,
        'x-forwarded-for': ip,
      },
      body: JSON.stringify(body),
    });
  }

  function signIn(password: string, ip = IP, email = EMAIL) {
    return post('/api/auth/sign-in/email', { email, password }, ip);
  }

  async function signUpVerified(email: string): Promise<void> {
    const response = await post(
      '/api/auth/sign-up/email',
      { name: 'Lan Nguyen', email, password: PASSWORD },
      '192.0.2.1',
    );
    expect(response.status).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
  }

  async function failTimes(count: number, ip = IP, email = EMAIL): Promise<void> {
    for (let i = 0; i < count; i++) {
      const response = await signIn(WRONG_PASSWORD, ip, email);
      expect(response.status, `failed attempt ${i + 1}`).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    }
  }

  it('returns the normal error for 10 wrong passwords, then 429 even with the right one', async () => {
    await failTimes(10);

    const response = await signIn(PASSWORD);

    expect(response.status).toBe(429);
    const body = signInRateLimitedErrorSchema.parse(await response.json());
    expect(body.code).toBe(SIGN_IN_RATE_LIMITED);
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_MS / 1000);
    expect(response.headers.get('retry-after')).toBe(String(body.retryAfterSeconds));
    const sessions = await database.db.execute(sql`select 1 from "session"`);
    expect(sessions.rows).toEqual([]);
  });

  it('keeps refusing wrong passwords with 429 while blocked', async () => {
    await failTimes(10);

    const response = await signIn(WRONG_PASSWORD);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: SIGN_IN_RATE_LIMITED });
  });

  it('still lets the same email sign in from another IP', async () => {
    await failTimes(10);

    expect((await signIn(PASSWORD, OTHER_IP)).status).toBe(200);
    expect((await signIn(PASSWORD)).status).toBe(429);
  });

  it('does not block another email from the same IP', async () => {
    await signUpVerified('other@example.test');
    await failTimes(10);

    expect((await signIn(PASSWORD, IP, 'other@example.test')).status).toBe(200);
  });

  it('counts the email whatever its case', async () => {
    await failTimes(10, IP, 'SomeOne@Example.TEST');

    expect((await signIn(PASSWORD)).status).toBe(429);
  });

  it('lets sign-in work again once the window has passed', async () => {
    const start = new Date('2026-10-19T09:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'], now: start });
    await failTimes(10);
    vi.setSystemTime(start.getTime() + WINDOW_MS - 1000);
    expect((await signIn(PASSWORD)).status).toBe(429);

    vi.setSystemTime(start.getTime() + WINDOW_MS);

    expect((await signIn(PASSWORD)).status).toBe(200);
  });

  it('resets the counter for that IP and email after a successful sign-in, not for other IPs', async () => {
    await failTimes(9);
    await failTimes(9, OTHER_IP);

    expect((await signIn(PASSWORD)).status).toBe(200);

    await failTimes(10);
    expect((await signIn(PASSWORD)).status).toBe(429);
    await failTimes(1, OTHER_IP);
    expect((await signIn(PASSWORD, OTHER_IP)).status).toBe(429);
  });

  it('does not count a refused sign-in for an unverified email as a failure', async () => {
    await post(
      '/api/auth/sign-up/email',
      { name: 'Minh Tran', email: 'minh@example.test', password: PASSWORD },
      '192.0.2.1',
    );
    for (let i = 0; i < 11; i++) {
      expect((await signIn(PASSWORD, IP, 'minh@example.test')).status).toBe(403);
    }
  });

  it('ignores X-Forwarded-For unless the proxy is trusted', async () => {
    const direct = await startTestApp();
    try {
      const attempt = (ip: string, password: string) =>
        direct.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: TEST_WEB_ORIGIN,
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({ email: EMAIL, password }),
        });
      for (let i = 0; i < 10; i++) {
        expect((await attempt(`192.0.2.${i + 10}`, WRONG_PASSWORD)).status).toBe(401);
      }

      expect((await attempt(OTHER_IP, PASSWORD)).status).toBe(429);
    } finally {
      await direct.close();
    }
  });

  it('keeps plain email addresses out of Redis keys and logs', async () => {
    await failTimes(10);
    expect((await signIn(PASSWORD)).status).toBe(429);

    const keys = await limitKeys();
    expect(keys).toHaveLength(1);
    const stored = [...keys, ...Object.values(await redis.hgetall(keys[0] ?? ''))].join(' ');
    expect(stored).not.toContain('someone');
    expect(stored).not.toContain('example.test');
    expect(logger.lines.length).toBeGreaterThan(0);
    expect(logger.lines.join('\n')).not.toContain(EMAIL);
  });
});
