import { z } from 'zod';
import { JOB_STATUSES, jobSummarySchema } from './jobs.js';

/** Jobs per page of `GET /api/jobs` (decisions §11). */
export const JOB_LIST_PAGE_SIZE = 25;

/** Longest search accepted by `GET /api/jobs`, after trimming. */
export const JOB_LIST_QUERY_MAX_LENGTH = 200;

/** The statuses the default (`active`) list shows: Closed jobs only appear through the filter (decisions §5). */
export const ACTIVE_JOB_STATUSES = ['draft', 'open', 'paused'] as const;

/** Values of the `status` filter of `GET /api/jobs`: `active` or one lifecycle status. */
export const JOB_LIST_STATUSES = ['active', ...JOB_STATUSES] as const;

export const jobListStatusSchema = z.enum(JOB_LIST_STATUSES);

export type JobListStatus = z.infer<typeof jobListStatusSchema>;

/**
 * Query string of `GET /api/jobs`. `q` is matched against title and code, accent- and
 * case-insensitively, and dropped when blank; `status` defaults to `active`; `page` is 1-based.
 */
export const jobListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(JOB_LIST_QUERY_MAX_LENGTH)
    .optional()
    .transform((q) => (q === '' ? undefined : q)),
  status: jobListStatusSchema.default('active'),
  page: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .transform(Number)
    .default(1),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;

/**
 * `GET /api/jobs`: one page of the jobs the caller may see, newest first, with `total` counting
 * only those. 400 `VALIDATION_FAILED`, 401 `UNAUTHENTICATED`, 403 `WORKSPACE_REQUIRED` /
 * `WORKSPACE_ACCESS_REVOKED`.
 */
export const jobListResponseSchema = z.object({
  items: z.array(jobSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type JobListResponse = z.infer<typeof jobListResponseSchema>;
