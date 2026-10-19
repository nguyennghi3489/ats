import { randomUUID } from 'node:crypto';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/config.js';
import { JsonLogger } from '../../src/logging/json-logger.js';
import { testDatabaseUrl } from './test-database.js';

/** `webOrigin` of the test app: send it as `Origin` on auth requests, as the browser would. */
export const TEST_WEB_ORIGIN = 'http://localhost:5173';

/** The Compose Redis (`REDIS_URL`), shared by tests that each use their own key prefix. */
export const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/** The API booted in-process, listening on a random local port. */
export interface TestApp {
  readonly app: INestApplication;
  /** `http://127.0.0.1:<port>` */
  readonly baseUrl: string;
  /** Prefix of every Redis key this app writes; a worker for its queues must use it too. */
  readonly redisPrefix: string;
  /** `fetch` against the app, e.g. `request('/health')`. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Stops the app and deletes its Redis keys. */
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Receives the app's logs; by default they are dropped. */
  logger?: LoggerService;
}

/**
 * Boots the whole API (same module and HTTP setup as `main.ts`) against the test database and
 * the Compose Redis under a fresh key prefix. Pass `overrides` to change the config, e.g. an
 * unreachable `databaseUrl` or `trustProxy: true`. Call `close()` in `afterAll`.
 */
export async function startTestApp(
  overrides: Partial<AppConfig> = {},
  options: TestAppOptions = {},
): Promise<TestApp> {
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'error',
    databaseUrl: overrides.databaseUrl ?? testDatabaseUrl(),
    redisUrl: TEST_REDIS_URL,
    betterAuthSecret: 'test-only-better-auth-secret-0123456789abcdef',
    betterAuthUrl: 'http://127.0.0.1:3000',
    webOrigin: TEST_WEB_ORIGIN,
    trustProxy: false,
    ...overrides,
  };
  const redisPrefix = `ats-test-${randomUUID()}`;
  const app = await createApp(config, options.logger ?? new JsonLogger({ logLevels: [] }), {
    redisPrefix,
  });
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return {
    app,
    baseUrl,
    redisPrefix,
    request: (path, init) => fetch(new URL(path, baseUrl), init),
    close: async () => {
      await app.close();
      const redis = new Redis(config.redisUrl);
      try {
        const keys = await redis.keys(`${redisPrefix}:*`);
        if (keys.length > 0) await redis.del(...keys);
      } finally {
        await redis.quit();
      }
    },
  };
}
