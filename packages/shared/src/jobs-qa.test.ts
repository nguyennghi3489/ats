import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGE_NAMES, jobLocationSchema, jobTitleSchema } from './index.js';

// QA for #123: edges of the job title, location and default stage definitions.
describe('QA #123: jobTitleSchema', () => {
  it('accepts a one-character title and rejects 201 Vietnamese characters', () => {
    expect(jobTitleSchema.parse(' a ')).toBe('a');
    expect(jobTitleSchema.safeParse('ữ'.repeat(200)).success).toBe(true);
    expect(jobTitleSchema.safeParse('ữ'.repeat(201)).success).toBe(false);
  });

  it('rejects a title that is only tabs and newlines, and a non-string', () => {
    expect(jobTitleSchema.safeParse('\t\n ').success).toBe(false);
    expect(jobTitleSchema.safeParse(42).success).toBe(false);
    expect(jobTitleSchema.safeParse(null).success).toBe(false);
  });
});

describe('QA #123: jobLocationSchema', () => {
  it('rejects a city with a null or missing country, and malformed codes', () => {
    expect(jobLocationSchema.safeParse({ country: null, city: 'Hà Nội' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: undefined, city: 'Hà Nội' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: 'Vn' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: '84' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: ' VN' }).success).toBe(false);
  });

  it('accepts a known code with no city', () => {
    expect(jobLocationSchema.parse({ country: 'SG' })).toEqual({ country: 'SG' });
  });
});

describe('QA #123: DEFAULT_STAGE_NAMES', () => {
  it('pairs four vi names with four en names', () => {
    expect(DEFAULT_STAGE_NAMES.vi).toHaveLength(4);
    expect(DEFAULT_STAGE_NAMES.en).toHaveLength(4);
    expect(DEFAULT_STAGE_NAMES.vi[0]).toBe('Mới');
    expect(DEFAULT_STAGE_NAMES.en[3]).toBe('Offer');
  });
});
