import {
  JOB_VERSION_STALE,
  type JobStages,
  STAGE_PLAN_INVALID,
  type StagePlan,
  type StagePlanSave,
  validateStagePlan,
} from '@ats/shared';
import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq, type SQL, sql } from 'drizzle-orm';
import {
  canEditJob,
  findVisibleJob,
  forbidden,
  type JobAccessActor,
  jobNotFound,
} from '../access/jobs.access.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { jobStages, jobs } from '../jobs/jobs.schema.js';
import { StagesService } from './stages.service.js';

/** 422 with one of the stage-plan codes. */
export function stagePlanRejected(code: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message: `Stage plan rejected: ${code}` });
}

@Injectable()
export class StagesSaveService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly stages: StagesService,
  ) {}

  /**
   * Saves the Quy trình tab's draft of job `jobId` in one transaction (decisions §6) and answers
   * the job's stages as `GET /api/jobs/:id/stages` does, with the new version. `request.stages`
   * lists every stage of the job once, active ones in their new order: existing stages by `id`,
   * new ones by `tempId`. Active stages get positions 1…n; a newly retired stage keeps its last
   * position and gets `retired_at`; a restored one loses it. Stages are never deleted.
   *
   * Throws 404 `JOB_NOT_FOUND` (missing or hidden, decisions §3), 403 `FORBIDDEN` (read-only
   * role), 409 `JOB_VERSION_STALE`, 422 `STAGE_PLAN_INVALID` (the request does not list exactly
   * this job's stages) or the first `validateStagePlan` code. Anything thrown rolls back every
   * write. Moving the applications of a retired stage to its target comes with applications.
   */
  async save(actor: JobAccessActor, jobId: string, request: StagePlanSave): Promise<JobStages> {
    return this.database.transaction(async (tx) => {
      const job = await findVisibleJob(tx, actor, jobId);
      if (!job) throw jobNotFound();
      if (!canEditJob(actor, job)) throw forbidden();

      // Lock the job row: saves of one job run one after the other, so the second sees a stale
      // version. The version is read again under the lock.
      const [locked] = await tx
        .select({ version: jobs.version })
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .for('update');
      if (!locked) throw jobNotFound();
      if (locked.version !== request.version) {
        throw new ConflictException({
          code: JOB_VERSION_STALE,
          message: 'The job changed since it was loaded',
        });
      }

      const existing = await tx
        .select({
          id: jobStages.id,
          name: jobStages.name,
          position: jobStages.position,
          retiredAt: jobStages.retiredAt,
        })
        .from(jobStages)
        .where(eq(jobStages.jobId, job.id));
      const saved = new Map(existing.map((stage) => [stage.id, stage]));

      // Every key (an existing id or a new tempId) once; every existing stage listed.
      const keys = new Set<string>();
      for (const stage of request.stages) {
        const key = stage.id ?? stage.tempId;
        if (key === undefined || keys.has(key)) throw stagePlanRejected(STAGE_PLAN_INVALID);
        if (stage.id !== undefined && !saved.has(stage.id)) {
          throw stagePlanRejected(STAGE_PLAN_INVALID);
        }
        if (stage.tempId !== undefined && saved.has(stage.tempId)) {
          throw stagePlanRejected(STAGE_PLAN_INVALID);
        }
        keys.add(key);
      }
      if (existing.some((stage) => !keys.has(stage.id))) {
        throw stagePlanRejected(STAGE_PLAN_INVALID);
      }

      let activeCount = 0;
      const plan: StagePlan = request.stages.map((stage) => ({
        id: (stage.id ?? stage.tempId)!,
        name: stage.name,
        position: stage.retired ? (saved.get(stage.id ?? '')?.position ?? 0) : (activeCount += 1),
        retired: stage.retired,
        ...(stage.retireTargetId === undefined ? {} : { retireTargetId: stage.retireTargetId }),
        ...(stage.tempId === undefined ? {} : { isNew: true }),
      }));
      const [error] = validateStagePlan(plan);
      if (error) throw stagePlanRejected(error.code);

      const inserts: (typeof jobStages.$inferInsert)[] = [];
      for (const [index, stage] of request.stages.entries()) {
        const position = plan[index]!.position;
        const before = stage.id === undefined ? undefined : saved.get(stage.id);
        if (before === undefined) {
          // A stage added and retired in the same draft is no change: nothing to keep.
          if (!stage.retired) inserts.push({ jobId: job.id, name: stage.name, position });
          continue;
        }
        const wasRetired = before.retiredAt !== null;
        const changes: { name?: string; position?: number; retiredAt?: SQL | null } = {};
        if (before.name !== stage.name) changes.name = stage.name;
        if (!stage.retired && before.position !== position) changes.position = position;
        if (stage.retired && !wasRetired) changes.retiredAt = sql`now()`;
        if (!stage.retired && wasRetired) changes.retiredAt = null;
        if (Object.keys(changes).length > 0) {
          await tx.update(jobStages).set(changes).where(eq(jobStages.id, before.id));
        }
      }
      if (inserts.length > 0) await tx.insert(jobStages).values(inserts);

      await tx
        .update(jobs)
        .set({ version: sql`${jobs.version} + 1` })
        .where(eq(jobs.id, job.id));

      const stages = await this.stages.find(actor, job.id, tx);
      if (!stages) throw jobNotFound();
      return stages;
    });
  }
}
