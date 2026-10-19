import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  RESEND_COOLDOWN_SECONDS,
  RESEND_MAX_PER_WINDOW,
  RESEND_WINDOW_SECONDS,
  VERIFICATION_LINK_EXPIRES_IN_SECONDS,
  VerificationResend,
} from './verification-resend.js';

// Against the Compose Redis (`docker compose up -d --wait redis`), each test with its own prefix.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const secret = 'test-only-better-auth-secret-0123456789abcdef';
const SECOND = 1_000;
const start = Date.parse('2026-10-01T08:00:00.000Z');

describe('rule values (decisions §2)', () => {
  it('is 60 s between sends, 5 sends per rolling hour, links valid 24 h', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(RESEND_MAX_PER_WINDOW).toBe(5);
    expect(RESEND_WINDOW_SECONDS).toBe(3_600);
    expect(VERIFICATION_LINK_EXPIRES_IN_SECONDS).toBe(86_400);
  });
});

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  New.User@Example.TEST ')).toBe('new.user@example.test');
  });
});

describe('VerificationResend (Redis)', () => {
  const redis = new Redis(redisUrl);
  let keyPrefix: string;
  let resend: VerificationResend;
  const email = 'new.user@example.test';

  beforeEach(() => {
    keyPrefix = `ats-test-${randomUUID()}`;
    resend = new VerificationResend(redis, { secret, keyPrefix });
  });

  afterAll(async () => {
    const keys = await redis.keys('ats-test-*:verify-email:*');
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('allows the first send', async () => {
    expect(await resend.take(email, start)).toEqual({ allowed: true });
  });

  it('refuses another send within 60 s with the seconds left', async () => {
    await resend.take(email, start);

    expect(await resend.take(email, start + 15 * SECOND)).toEqual({
      allowed: false,
      code: 'RESEND_TOO_SOON',
      retryAfterSeconds: 45,
    });
    expect(await resend.take(email, start + 59_500)).toEqual({
      allowed: false,
      code: 'RESEND_TOO_SOON',
      retryAfterSeconds: 1,
    });
  });

  it('allows a send 60 s after the last one', async () => {
    await resend.take(email, start);

    expect(await resend.take(email, start + 60 * SECOND)).toEqual({ allowed: true });
  });

  it('counts a refused attempt as no send', async () => {
    await resend.take(email, start);
    await resend.take(email, start + 30 * SECOND);

    expect(await resend.take(email, start + 60 * SECOND)).toEqual({ allowed: true });
  });

  it('refuses the sixth send within an hour until the oldest leaves the window', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect(await resend.take(email, start + index * 60 * SECOND)).toEqual({ allowed: true });
    }

    expect(await resend.take(email, start + 5 * 60 * SECOND)).toEqual({
      allowed: false,
      code: 'RESEND_LIMIT',
      retryAfterSeconds: 55 * 60,
    });
    expect(await resend.take(email, start + 60 * 60 * SECOND)).toEqual({ allowed: true });
  });

  it('counts sends recorded without a check (the sign-up email)', async () => {
    await resend.record(email, start);

    expect(await resend.take(email, start + SECOND)).toMatchObject({ code: 'RESEND_TOO_SOON' });
  });

  it('treats differently written forms of one address as the same email', async () => {
    await resend.take('New.User@Example.test', start);

    expect(await resend.take(' new.user@example.TEST', start + SECOND)).toMatchObject({
      code: 'RESEND_TOO_SOON',
    });
    expect(await resend.take('other@example.test', start + SECOND)).toEqual({ allowed: true });
  });

  it('keeps only the newest link current', async () => {
    await resend.setCurrentLink(email, 'token-1');
    expect(await resend.isCurrentLink(email, 'token-1')).toBe(true);

    await resend.setCurrentLink(email, 'token-2');

    expect(await resend.isCurrentLink(email, 'token-1')).toBe(false);
    expect(await resend.isCurrentLink(email, 'token-2')).toBe(true);
    expect(await resend.isCurrentLink('other@example.test', 'token-2')).toBe(false);
  });

  it('writes keys without the address, under the prefix, expiring', async () => {
    await resend.take(email, start);
    await resend.setCurrentLink(email, 'token-1');

    const keys = await redis.keys(`${keyPrefix}:*`);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toMatch(/new\.user|example/i);
      expect(await redis.pttl(key)).toBeGreaterThan(0);
    }
    const link = keys.find((key) => key.includes(':link:')) ?? '';
    expect(await redis.get(link)).not.toBe('token-1');
  });
});
