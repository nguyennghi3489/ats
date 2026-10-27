import { z } from 'zod';
import { jobStatusSchema, type JobStatus } from './jobs.js';

/**
 * The job lifecycle (decisions §5), as the moves each status allows, in the order the
 * "Thao tác tuyển dụng" menu lists them:
 * - Draft → Open (needs a title and at least one active stage, checked by the API);
 * - Open ⇄ Paused;
 * - Open / Paused → Closed (confirmed in the web app);
 * - Closed → Open (reopen).
 */
const TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  draft: ['open'],
  open: ['paused', 'closed'],
  paused: ['open', 'closed'],
  closed: ['open'],
};

/** The statuses a job in `status` may move to, in menu order. */
export function allowedTransitions(status: JobStatus): readonly JobStatus[] {
  return TRANSITIONS[status];
}

/** `true` when the lifecycle allows moving a job from `from` to `to`. */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * `POST /api/jobs/:id/status` body: the target status and the job `version` the caller last saw.
 * Answers the job page header (with the new `version`), or 400 `VALIDATION_FAILED`, 403
 * `FORBIDDEN` (collaborators), 404 `JOB_NOT_FOUND`, 409 `JOB_STATUS_TRANSITION_INVALID`,
 * `JOB_VERSION_STALE` or `JOB_NOT_READY`.
 */
export const changeJobStatusRequestSchema = z.strictObject({
  to: jobStatusSchema,
  version: z.number().int().positive(),
});

export type ChangeJobStatusRequest = z.infer<typeof changeJobStatusRequestSchema>;
