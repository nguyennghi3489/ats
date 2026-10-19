import { SIGN_IN_RATE_LIMITED } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, testRedisUrl, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

// Issue #83 (decisions §2): failed sign-ins are limited to 10 per 15 minutes per IP + email. The
// limit must hold when the attempts arrive at the same time, not only one after another: otherwise
// a client checks as many passwords as it can send in parallel before the first failure is counted.
const EMAIL = 'burst@example.test';
const PASSWORD = 'correct-horse-battery-staple';
const IP = '203.0.113.50';
const MAX_FAILURES = 10;
const PARALLEL_ATTEMPTS = 30;

describe('failed sign-in limit under concurrent attempts', () => {
  let api: TestApp;
  let database: Database;
  let redis: Redis;

  beforeAll(async () => {
    api = await startTestApp({ trustProxy: true });
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    redis = new Redis(testRedisUrl());
    const keys = await redis.keys('sign-in-limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    const response = await post('/api/auth/sign-up/email', {
      name: 'Burst Test',
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${EMAIL}`);
  });

  afterAll(async () => {
    await api.close();
    await database.close();
    await redis.quit();
  });

  function post(path: string, body: unknown) {
    return api.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_WEB_ORIGIN,
        'x-forwarded-for': IP,
      },
      body: JSON.stringify(body),
    });
  }

  it('checks at most 10 wrong passwords when 30 arrive at once, refusing the rest with 429', async () => {
    const responses = await Promise.all(
      Array.from({ length: PARALLEL_ATTEMPTS }, (_, i) =>
        post('/api/auth/sign-in/email', { email: EMAIL, password: `wrong-password-${i}` }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    const checked = statuses.filter((status) => status === 401).length;
    const refused = statuses.filter((status) => status === 429).length;

    expect(checked, `statuses: ${JSON.stringify(statuses)}`).toBeLessThanOrEqual(MAX_FAILURES);
    expect(refused).toBe(PARALLEL_ATTEMPTS - checked);
    const blocked = await post('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: SIGN_IN_RATE_LIMITED });
  });
});
