import { z } from 'zod';
import { jobAccessScopeSchema, jobSummarySchema } from './jobs.js';

/**
 * `GET /api/jobs/:id`: what the job page header needs, as the caller sees it. `owner` is display
 * only; `canEdit` is `false` for collaborators (read-only) and drives the header actions; `version`
 * is what a change of the job (e.g. its status) sends back to reject stale edits. A missing
 * job, a hidden one, one of another workspace and a non-uuid id all answer the same 404
 * `JOB_NOT_FOUND` (decisions §3).
 */
export const jobHeaderSchema = jobSummarySchema.extend({
  accessScope: jobAccessScopeSchema,
  canEdit: z.boolean(),
  version: z.number().int().positive(),
});

export type JobHeader = z.infer<typeof jobHeaderSchema>;
