import { describe, expect, it } from 'vitest';
import { healthSchema } from './index.js';

describe('healthSchema', () => {
  it('accepts an ok status', () => {
    expect(healthSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects an unknown status', () => {
    expect(healthSchema.safeParse({ status: 'down' }).success).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(healthSchema.safeParse({}).success).toBe(false);
  });
});
