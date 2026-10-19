import { describe, expect, it } from 'vitest';
import { healthSchema } from './index.js';

describe('healthSchema', () => {
  it('accepts a healthy API with a reachable database', () => {
    expect(healthSchema.parse({ status: 'ok', db: 'ok' })).toEqual({ status: 'ok', db: 'ok' });
  });

  it('accepts an unhealthy API with the database down', () => {
    expect(healthSchema.parse({ status: 'error', db: 'down' })).toEqual({
      status: 'error',
      db: 'down',
    });
  });

  it('rejects an unknown status', () => {
    expect(healthSchema.safeParse({ status: 'down', db: 'ok' }).success).toBe(false);
  });

  it('rejects a missing status or db', () => {
    expect(healthSchema.safeParse({}).success).toBe(false);
    expect(healthSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });
});
