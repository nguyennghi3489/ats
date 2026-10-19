import type { INestApplication, LoggerService } from '@nestjs/common';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/config.js';
import { JsonLogger } from '../../src/logging/json-logger.js';
import { testDatabaseUrl } from './test-database.js';

/** `webOrigin` of the test app: send it as `Origin` on auth requests, as the browser would. */
export const TEST_WEB_ORIGIN = 'http://localhost:5173';

/**
 * Redis the test app uses (`REDIS_URL`, default the Compose Redis), in its own database (12) so the
 * suite can delete its keys without touching a developer's running API or worker.
 */
export function testRedisUrl(env: Record<string, string | undefined> = process.env): string {
  const base = (env.REDIS_URL || 'redis://127.0.0.1:6379').replace(/\/\d*$/, '');
  return `${base}/12`;
}

/** The API booted in-process, listening on a random local port. */
export interface TestApp {
  readonly app: INestApplication;
  /** `http://127.0.0.1:<port>` */
  readonly baseUrl: string;
  /** `fetch` against the app, e.g. `request('/health')`. */
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

/**
 * Boots the whole API (same module and HTTP setup as `main.ts`) against the test database.
 * Pass `overrides` to change the config, e.g. an unreachable `databaseUrl`, and `logger` to read
 * what the app logs (silent by default). Call `close()` in `afterAll`.
 */
export async function startTestApp(
  overrides: Partial<AppConfig> = {},
  logger: LoggerService = new JsonLogger({ logLevels: [] }),
): Promise<TestApp> {
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'error',
    databaseUrl: overrides.databaseUrl ?? testDatabaseUrl(),
    betterAuthSecret: 'test-only-better-auth-secret-0123456789abcdef',
    betterAuthUrl: 'http://127.0.0.1:3000',
    webOrigin: TEST_WEB_ORIGIN,
    redisUrl: testRedisUrl(),
    trustProxy: false,
    ...overrides,
  };
  const app = await createApp(config, logger);
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return {
    app,
    baseUrl,
    request: (path, init) => fetch(new URL(path, baseUrl), init),
    close: () => app.close(),
  };
}
