import { z } from 'zod';

/** A stage in use on a job (decisions §6). `position` is 1-based; names are data, never translated. */
export const activeStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int().positive(),
});

export type ActiveStage = z.infer<typeof activeStageSchema>;

/** A retired stage ("Giai đoạn đã ngừng dùng"): kept for history, can be restored. */
export const retiredStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  retiredAt: z.iso.datetime(),
});

export type RetiredStage = z.infer<typeof retiredStageSchema>;

/**
 * `GET /api/jobs/:id/stages`: the job's stages for the Quy trình tab. `active` is in `position`
 * order, `retired` newest first. `version` is the job's version, sent back by Save to reject stale
 * edits; `canEdit` is `false` for collaborators (read-only). A missing job, a hidden one, one of
 * another workspace and a non-uuid id all answer the same 404 `JOB_NOT_FOUND` (decisions §3).
 */
export const jobStagesSchema = z.object({
  jobId: z.string().min(1),
  version: z.number().int().positive(),
  canEdit: z.boolean(),
  active: z.array(activeStageSchema),
  retired: z.array(retiredStageSchema),
});

export type JobStages = z.infer<typeof jobStagesSchema>;
