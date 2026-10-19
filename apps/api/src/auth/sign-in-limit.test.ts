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

  it('lets an address with no failures through and counts the attempt', async () => {
    const subject = limiter({ maxFailures: 1 });
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('blocks once the maximum number of attempts is counted, for the rest of the window', async () => {
    const subject = limiter({ maxFailures: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) {
      expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    }
    now += 20_500;

    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 40 });
    // A refused attempt is not counted: the window still ends at the same time.
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 40 });
  });

  it('lets through at most the maximum when attempts arrive at the same time', async () => {
    const subject = limiter({ maxFailures: 10 });
    const results = await Promise.all(Array.from({ length: 30 }, () => subject.acquire(IP, EMAIL)));
    expect(results.filter((result) => !result.blocked)).toHaveLength(10);
  });

  it('gives the slot back when an attempt is released', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.acquire(IP, EMAIL);
    await subject.release(IP, EMAIL);

    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('does nothing when releasing an attempt that holds no slot', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.release(IP, EMAIL);

    expect(await keys()).toHaveLength(0);
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('counts the window from the first attempt and starts over once it has passed', async () => {
    const subject = limiter({ maxFailures: 2, windowMs: 60_000 });
    await subject.acquire(IP, EMAIL);
    now += 59_000;
    await subject.acquire(IP, EMAIL);
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: true, retryAfterSeconds: 1 });

    now += 1_000;
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('keeps separate counters per IP and per email, whatever the email case', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.acquire(IP, 'SomeOne@Example.test');

    expect(await subject.acquire(IP, EMAIL)).toMatchObject({ blocked: true });
    expect(await subject.acquire(OTHER_IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(IP, 'other@example.test')).toEqual({ blocked: false });
  });

  it('resets only the counter of that IP and email', async () => {
    const subject = limiter({ maxFailures: 1 });
    await subject.acquire(IP, EMAIL);
    await subject.acquire(OTHER_IP, EMAIL);

    await subject.reset(IP, EMAIL);

    expect(await subject.acquire(IP, EMAIL)).toEqual({ blocked: false });
    expect(await subject.acquire(OTHER_IP, EMAIL)).toMatchObject({ blocked: true });
  });

  it('stores no plain email address or IP in Redis and expires the counter with the window', async () => {
    await limiter().acquire(IP, EMAIL);

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
