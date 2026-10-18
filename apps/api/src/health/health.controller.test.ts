import { healthSchema } from '@ats/shared';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config/config.js';
import { JsonLogger } from '../logging/json-logger.js';
import { HealthController } from './health.controller.js';

const testConfig: AppConfig = { nodeEnv: 'test', port: 0, logLevel: 'error' };

describe('HealthController', () => {
  it('reports ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });

  describe('GET /health', () => {
    let app: INestApplication;
    let baseUrl: string;

    beforeAll(async () => {
      app = await createApp(testConfig, new JsonLogger({ logLevels: [] }));
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with the shared health payload', async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'ok' });
      expect(healthSchema.safeParse(body).success).toBe(true);
      expect(response.headers.get('x-powered-by')).toBeNull();
    });
  });
});
