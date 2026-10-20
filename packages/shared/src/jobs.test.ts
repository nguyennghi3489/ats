import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CODES,
  DEFAULT_STAGE_NAMES,
  JOB_ACCESS_SCOPES,
  JOB_STATUSES,
  JOB_TITLE_MAX_LENGTH,
  LOCALES,
  isCountryCode,
  jobAccessScopeSchema,
  jobLocationSchema,
  jobStatusSchema,
  jobSummarySchema,
  jobTitleSchema,
} from './index.js';

describe('jobStatusSchema', () => {
  it('accepts the four lifecycle statuses', () => {
    expect(JOB_STATUSES).toEqual(['draft', 'open', 'paused', 'closed']);
    for (const status of JOB_STATUSES) {
      expect(jobStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects anything else', () => {
    expect(jobStatusSchema.safeParse('archived').success).toBe(false);
    expect(jobStatusSchema.safeParse('Open').success).toBe(false);
  });
});

describe('jobAccessScopeSchema', () => {
  it('accepts normal and restricted only', () => {
    expect(JOB_ACCESS_SCOPES).toEqual(['normal', 'restricted']);
    expect(jobAccessScopeSchema.parse('restricted')).toBe('restricted');
    expect(jobAccessScopeSchema.safeParse('private').success).toBe(false);
  });
});

describe('jobTitleSchema', () => {
  it('trims the title', () => {
    expect(jobTitleSchema.parse('  Kỹ sư phần mềm  ')).toBe('Kỹ sư phần mềm');
  });

  it('rejects an empty or blank title', () => {
    expect(jobTitleSchema.safeParse('').success).toBe(false);
    expect(jobTitleSchema.safeParse('   ').success).toBe(false);
  });

  it('accepts 200 characters and rejects 201', () => {
    expect(JOB_TITLE_MAX_LENGTH).toBe(200);
    expect(jobTitleSchema.safeParse('a'.repeat(200)).success).toBe(true);
    expect(jobTitleSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('counts the length after trimming', () => {
    expect(jobTitleSchema.safeParse(` ${'a'.repeat(200)} `).success).toBe(true);
  });
});

describe('jobLocationSchema', () => {
  it('accepts a country alone', () => {
    expect(jobLocationSchema.parse({ country: 'VN' })).toEqual({ country: 'VN' });
  });

  it('accepts a country with a trimmed city', () => {
    expect(jobLocationSchema.parse({ country: 'VN', city: '  Hà Nội ' })).toEqual({
      country: 'VN',
      city: 'Hà Nội',
    });
  });

  it('rejects a city without a country', () => {
    expect(jobLocationSchema.safeParse({ city: 'Hà Nội' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: '', city: 'Hà Nội' }).success).toBe(false);
  });

  it('rejects an unknown country code', () => {
    expect(jobLocationSchema.safeParse({ country: 'XX' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: 'vn' }).success).toBe(false);
    expect(jobLocationSchema.safeParse({ country: 'VNM' }).success).toBe(false);
  });

  it('rejects a blank city', () => {
    expect(jobLocationSchema.safeParse({ country: 'VN', city: '   ' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(jobLocationSchema.safeParse({ country: 'VN', region: 'Bắc' }).success).toBe(false);
  });
});

describe('COUNTRY_CODES', () => {
  it('lists the 249 ISO 3166-1 alpha-2 codes, unique and uppercase', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    for (const code of COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('includes Vietnam and the United States', () => {
    expect(isCountryCode('VN')).toBe(true);
    expect(isCountryCode('US')).toBe(true);
    expect(isCountryCode('UK')).toBe(false);
  });
});

describe('DEFAULT_STAGE_NAMES', () => {
  it('has the four default stages in order, in Vietnamese', () => {
    expect(DEFAULT_STAGE_NAMES.vi).toEqual(['Mới', 'Sơ loại', 'Phỏng vấn', 'Đề nghị']);
  });

  it('has the four default stages in order, in English', () => {
    expect(DEFAULT_STAGE_NAMES.en).toEqual(['New', 'Screening', 'Interview', 'Offer']);
  });

  it('has an entry for every locale', () => {
    expect(Object.keys(DEFAULT_STAGE_NAMES).sort()).toEqual([...LOCALES].sort());
  });
});

describe('jobSummarySchema', () => {
  it('parses a job with an owner', () => {
    const job = {
      id: '0b9d6c1e-5d1f-4a43-9d0f-5f8a2b3c4d5e',
      code: 'AN-001',
      title: 'Kỹ sư phần mềm',
      status: 'open',
      owner: { id: 'user-1', name: 'Lan' },
    };
    expect(jobSummarySchema.parse(job)).toEqual(job);
  });

  it('parses a job without an owner', () => {
    const job = {
      id: '0b9d6c1e-5d1f-4a43-9d0f-5f8a2b3c4d5e',
      code: 'AN-002',
      title: 'Kế toán',
      status: 'draft',
      owner: null,
    };
    expect(jobSummarySchema.parse(job)).toEqual(job);
  });

  it('rejects an unknown status', () => {
    expect(
      jobSummarySchema.safeParse({
        id: '0b9d6c1e-5d1f-4a43-9d0f-5f8a2b3c4d5e',
        code: 'AN-003',
        title: 'Kế toán',
        status: 'archived',
        owner: null,
      }).success,
    ).toBe(false);
  });
});
