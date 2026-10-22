import { describe, expect, it } from 'vitest';
import {
  ACCESS_ERROR_CODES,
  accessErrorCodeSchema,
  FORBIDDEN,
  JOB_NOT_FOUND,
  RECORD_ACCESS_ERROR_CODES,
  UNAUTHENTICATED,
  WORKSPACE_ACCESS_REVOKED,
  WORKSPACE_REQUIRED,
} from './index.js';

describe('access error codes', () => {
  it('lists the codes the global access guard answers with', () => {
    expect([UNAUTHENTICATED, WORKSPACE_REQUIRED, WORKSPACE_ACCESS_REVOKED]).toEqual([
      'UNAUTHENTICATED',
      'WORKSPACE_REQUIRED',
      'WORKSPACE_ACCESS_REVOKED',
    ]);
    expect(ACCESS_ERROR_CODES).toEqual([
      UNAUTHENTICATED,
      WORKSPACE_REQUIRED,
      WORKSPACE_ACCESS_REVOKED,
    ]);
  });

  it('parses only those codes', () => {
    expect(accessErrorCodeSchema.parse('WORKSPACE_ACCESS_REVOKED')).toBe(
      'WORKSPACE_ACCESS_REVOKED',
    );
    expect(accessErrorCodeSchema.safeParse('FORBIDDEN').success).toBe(false);
  });
});

describe('record access error codes', () => {
  it('names the codes of hidden or missing jobs and of refused actions', () => {
    expect(JOB_NOT_FOUND).toBe('JOB_NOT_FOUND');
    expect(FORBIDDEN).toBe('FORBIDDEN');
    expect(RECORD_ACCESS_ERROR_CODES).toEqual([JOB_NOT_FOUND, FORBIDDEN]);
  });
});
