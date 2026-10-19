import { healthSchema } from '@ats/shared';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/config.js';
import { JsonLogger } from '../logging/json-logger.js';

// Integration tests against the Compose Postgres test database (`docker compose up -d --wait postgres`).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://ats:ats@127.0.0.1:5432/ats_test';
// Nothing listens on port 1: stands in for "Postgres stopped".
const unreachableUrl = 'postgres://ats:ats@127.0.0.1:1/ats_test';

function configWith(databaseUrl: string): AppConfig {
  return { nodeEnv: 'test', port: 0, logLevel: 'error', databaseUrl };
}

async function startApp(databaseUrl: string): Promise<{ app: INestApplication; baseUrl: string }> {
  const app = await createApp(configWith(databaseUrl), new JsonLogger({ logLevels: [] }));
  await app.listen(0, '127.0.0.1');
  return { app, baseUrl: await app.getUrl() };
}

describe('GET /health', () => {
  describe('with Postgres up', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await startApp(testDatabaseUrl));
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with db "ok" in the shared health payload', async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'ok', db: 'ok' });
      expect(healthSchema.safeParse(body).success).toBe(true);
      expect(response.headers.get('x-powered-by')).toBeNull();
    });
  });

  describe('with Postgres unreachable', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      ({ app, baseUrl } = await startApp(unreachableUrl));
    });

    afterAll(async () => {
      await app.close();
    });

    it('still starts, and returns 503 with db "down"', async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(503);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'error', db: 'down' });
      expect(healthSchema.safeParse(body).success).toBe(true);
    });
  });
});
