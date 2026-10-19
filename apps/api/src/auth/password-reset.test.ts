import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createPasswordResetLimits,
  isUsableResetLink,
  RESET_PASSWORD_LINK_EXPIRES_IN_SECONDS,
  resetPasswordIdentifier,
  webResetPageUrl,
} from './password-reset.js';
import { VerificationResend } from './verification-resend.js';

// Against the Compose Redis (`docker compose up -d --wait redis`), each test with its own prefix.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const secret = 'test-only-better-auth-secret-0123456789abcdef';
const SECOND = 1_000;
const now = Date.parse('2026-10-01T08:00:00.000Z');

describe('rule values (decisions §2)', () => {
  it('keeps a reset link valid for 1 hour', () => {
    expect(RESET_PASSWORD_LINK_EXPIRES_IN_SECONDS).toBe(3_600);
  });
});

describe('isUsableResetLink', () => {
  it('accepts a stored link until it expires', () => {
    expect(isUsableResetLink({ expiresAt: new Date(now + SECOND) }, now)).toBe(true);
  });

  it('refuses an expired, used or unknown link', () => {
    expect(isUsableResetLink({ expiresAt: new Date(now - SECOND) }, now)).toBe(false);
    expect(isUsableResetLink(null, now)).toBe(false);
    expect(isUsableResetLink(undefined, now)).toBe(false);
  });
});

describe('resetPasswordIdentifier', () => {
  it('names a token the way Better Auth stores it', () => {
    expect(resetPasswordIdentifier('abc')).toBe('reset-password:abc');
  });
});

describe('webResetPageUrl', () => {
  it('points at the web reset page with the token', () => {
    expect(webResetPageUrl('http://localhost:5173', 'a b&c')).toBe(
      'http://localhost:5173/reset-password?token=a+b%26c',
    );
  });
});

describe('createPasswordResetLimits (Redis)', () => {
  const redis = new Redis(redisUrl);
  const email = 'reset.user@example.test';
  const prefixes: string[] = [];

  function freshPrefix(): string {
    const prefix = `ats-test-${randomUUID()}`;
    prefixes.push(prefix);
    return prefix;
  }

  afterAll(async () => {
    for (const prefix of prefixes) {
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length > 0) await redis.del(...keys);
    }
    await redis.quit();
  });

  it('applies the 60 s and 5 per hour limits under its own keys', async () => {
    const keyPrefix = freshPrefix();
    const limits = createPasswordResetLimits(redis, { secret, keyPrefix });

    expect(await limits.take(email, now)).toEqual({ allowed: true });
    expect(await limits.take(email, now + 10 * SECOND)).toEqual({
      allowed: false,
      code: 'RESEND_TOO_SOON',
      retryAfterSeconds: 50,
    });

    const keys = await redis.keys(`${keyPrefix}:*`);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^${keyPrefix}:reset-password:sends:[0-9a-f]{64}$`));
  });

  it('does not share counts with the verification resend', async () => {
    const keyPrefix = freshPrefix();
    const verification = new VerificationResend(redis, { secret, keyPrefix });
    await verification.take(email, now);

    const limits = createPasswordResetLimits(redis, { secret, keyPrefix });

    expect(await limits.take(email, now + SECOND)).toEqual({ allowed: true });
    expect(await verification.take(email, now + SECOND)).toMatchObject({
      code: 'RESEND_TOO_SOON',
    });
  });
});
