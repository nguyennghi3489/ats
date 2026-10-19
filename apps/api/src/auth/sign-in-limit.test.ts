import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  SIGN_IN_LIMIT_MAX_FAILURES,
  SIGN_IN_LIMIT_WINDOW_MS,
  SignInLimiter,
} from './sign-in-limit.js';

// Rules of the failed sign-in limit (decisions §2), against the Compose Redis
// (`docker compose up -d --wait redis`). Each test uses its own key prefix and a controlled clock.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const SECRET = 'test-only-sign-in-limit-secret-0123456789';
const EMAIL = 'someone@example.test';
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.4';

describe('normalizeEmail', () => {
  it('trims and lower-cases the address', () => {
    expect(normalizeEmail('  SomeOne@Example.TEST ')).toBe('someone@example.test');
  });
});

describe('SignInLimiter', () => {
  let redis: Redis;
  let prefix: string;
  let now: number;

  function limiter(overrides: { maxFailures?: number; windowMs?: number } = {}) {
    return new SignInLimiter(redis, {
      secret: SECRET,
      keyPrefix: prefix,
      now: () => now,
      ...overrides,
    });
  }

  async function keys(): Promise<string[]> {
    return redis.keys(`${prefix}*`);
  }

  beforeAll(() => {
    redis = new Redis(redisUrl);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(() => {
    prefix = `ats-test-${randomUUID()}:`;
    now = Date.UTC(2026, 9, 19, 9, 0, 0);
  });

  afterEach(async () => {
    const left = await keys();
    if (left.length > 0) {
      await redis.del(...left);
    }
  });

  it('allows 10 failures in 15 minutes, as decided', () => {
    expect(SIGN_IN_LIMIT_MAX_FAILURES).toBe(10);
    expect(SIGN_IN_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('does not block an address with no failures', async () => {
    expect(await limiter().check(IP, EMAIL)).toEqual({ blocked: false });
  });

  it('blocks after the maximum number of failures, for the rest of the window', async () => {
    const subject = limiter({ maxFailures: 3, windowMs: 60_000 });
    for (let i = 0; i < 2; i++) {
      await subject.recordFailure(IP, EMAIL);
    }
    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: false });

    await subject.recordFailure(IP, EMAIL);
    now += 20_500;

    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 40 });
  });

  it('counts the window from the first failure and starts over once it has passed', async () => {
    const subject = limiter({ maxFailures: 2, windowMs: 60_000 });
    await subject.recordFailure(IP, EMAIL);
    now += 59_000;
    await subject.recordFailure(IP, EMAIL);
    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 1 });

    now += 1_000;
    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: false });

    await subject.recordFailure(IP, EMAIL);
    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: false });
  });

  it('keeps separate counters per IP and per email, whatever the email case', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.recordFailure(IP, 'SomeOne@Example.test');

    expect(await subject.check(IP, EMAIL)).toMatchObject({ blocked: true });
    expect(await subject.check(OTHER_IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.check(IP, 'other@example.test')).toEqual({ blocked: false });
  });

  it('resets only the counter of that IP and email', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.recordFailure(IP, EMAIL);
    await subject.recordFailure(OTHER_IP, EMAIL);

    await subject.reset(IP, EMAIL);

    expect(await subject.check(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.check(OTHER_IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('stores no plain email address or IP in Redis and expires the counter with the window', async () => {
    await limiter().recordFailure(IP, EMAIL);

    const stored = await keys();
    expect(stored).toHaveLength(1);
    const [key = ''] = stored;
    const values = Object.values(await redis.hgetall(key)).join(' ');
    for (const text of [key, values]) {
      expect(text).not.toContain('someone');
      expect(text).not.toContain('example');
      expect(text).not.toContain(IP);
    }
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(SIGN_IN_LIMIT_WINDOW_MS);
  });
});
