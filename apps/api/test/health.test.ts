import { healthSchema } from '@ats/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/test-app.js';

// Nothing listens on port 1: stands in for "Postgres stopped".
const unreachableUrl = 'postgres://ats:ats@127.0.0.1:1/ats_test';

describe('GET /health', () => {
  describe('with Postgres up', () => {
    let api: TestApp;

    beforeAll(async () => {
      api = await startTestApp();
    });

    afterAll(async () => {
      await api.close();
    });

    it('returns 200 with db "ok" in the shared health payload', async () => {
      const response = await api.request('/health');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'ok', db: 'ok' });
      expect(healthSchema.safeParse(body).success).toBe(true);
      expect(response.headers.get('x-powered-by')).toBeNull();
    });
  });

  describe('with Postgres unreachable', () => {
    let api: TestApp;

    beforeAll(async () => {
      api = await startTestApp({ databaseUrl: unreachableUrl });
    });

    afterAll(async () => {
      await api.close();
    });

    it('still starts, and returns 503 with db "down"', async () => {
      const response = await api.request('/health');

      expect(response.status).toBe(503);
      const body: unknown = await response.json();
      expect(body).toEqual({ status: 'error', db: 'down' });
      expect(healthSchema.safeParse(body).success).toBe(true);
    });
  });
});
