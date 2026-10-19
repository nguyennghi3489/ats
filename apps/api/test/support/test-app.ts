import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/config.js';
import { JsonLogger } from '../../src/logging/json-logger.js';
import { testDatabaseUrl } from './test-database.js';

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
 * Pass `overrides` to change the config, e.g. an unreachable `databaseUrl`. Call `close()` in `afterAll`.
 */
export async function startTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'error',
    databaseUrl: overrides.databaseUrl ?? testDatabaseUrl(),
    ...overrides,
  };
  const app = await createApp(config, new JsonLogger({ logLevels: [] }));
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return {
    app,
    baseUrl,
    request: (path, init) => fetch(new URL(path, baseUrl), init),
    close: () => app.close(),
  };
}
