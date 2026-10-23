import { describe, expect, it } from 'vitest';
import {
  ACTIVE_JOB_STATUSES,
  JOB_LIST_PAGE_SIZE,
  JOB_LIST_QUERY_MAX_LENGTH,
  JOB_LIST_STATUSES,
  jobListQuerySchema,
  jobListResponseSchema,
} from './index.js';

describe('jobListQuerySchema', () => {
  it('defaults to the active statuses, no search and page 1', () => {
    expect(jobListQuerySchema.parse({})).toEqual({ status: 'active', page: 1 });
  });

  it('accepts every status filter, with active meaning draft, open and paused', () => {
    expect(JOB_LIST_STATUSES).toEqual(['active', 'draft', 'open', 'paused', 'closed']);
    expect(ACTIVE_JOB_STATUSES).toEqual(['draft', 'open', 'paused']);
    for (const status of JOB_LIST_STATUSES) {
      expect(jobListQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it('rejects an unknown or repeated status', () => {
    expect(jobListQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
    expect(jobListQuerySchema.safeParse({ status: 'Open' }).success).toBe(false);
    expect(jobListQuerySchema.safeParse({ status: ['open', 'paused'] }).success).toBe(false);
  });

  it('trims the search and drops it when empty', () => {
    expect(jobListQuerySchema.parse({ q: '  thiet ke ' }).q).toBe('thiet ke');
    expect(jobListQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(jobListQuerySchema.parse({ q: '' }).q).toBeUndefined();
  });

  it('rejects an overlong or repeated search', () => {
    expect(jobListQuerySchema.safeParse({ q: 'a'.repeat(JOB_LIST_QUERY_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(
      jobListQuerySchema.safeParse({ q: 'a'.repeat(JOB_LIST_QUERY_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(jobListQuerySchema.safeParse({ q: ['a', 'b'] }).success).toBe(false);
  });

  it('reads the page from the query string, 1-based', () => {
    expect(jobListQuerySchema.parse({ page: '2' }).page).toBe(2);
    for (const page of ['0', '-1', '1.5', 'abc', '']) {
      expect(jobListQuerySchema.safeParse({ page }).success, page).toBe(false);
    }
  });
});

describe('jobListResponseSchema', () => {
  it('is a page of job summaries with the total and the page size', () => {
    expect(JOB_LIST_PAGE_SIZE).toBe(25);
    const page = {
      items: [
        {
          id: 'b6f7e2a4-1f5c-4c47-9a54-8f0c4f8b2d11',
          code: 'MS-001',
          title: 'Thiết kế sản phẩm',
          status: 'open',
          owner: { id: 'u1', name: 'Lan Test' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    expect(jobListResponseSchema.parse(page)).toEqual(page);
  });
});
