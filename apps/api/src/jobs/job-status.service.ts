import {
  canTransition,
  type ChangeJobStatusRequest,
  JOB_NOT_READY,
  JOB_STATUS_TRANSITION_INVALID,
  JOB_VERSION_STALE,
  type JobHeader,
} from '@ats/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  canEditJob,
  findVisibleJob,
  forbidden,
  type JobAccessActor,
  jobNotFound,
} from '../access/jobs.access.js';
import { user } from '../auth/auth.schema.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { jobStages, jobs } from './jobs.schema.js';

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

@Injectable()
export class JobStatusService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * Moves job `jobId` to `request.to` along the lifecycle (decisions §5), in one transaction, and
   * answers the job page header with the new status and version. The job row is locked first so
   * two changes of the same job run one after the other; the second then sees a stale version.
   * Throws 404 `JOB_NOT_FOUND` (missing or hidden, decisions §3), 403 `FORBIDDEN` (read-only role),
   * 409 `JOB_VERSION_STALE`, `JOB_STATUS_TRANSITION_INVALID` or `JOB_NOT_READY` (a Draft without a
   * title or an active stage).
   */
  async change(
    actor: JobAccessActor,
    jobId: string,
    request: ChangeJobStatusRequest,
  ): Promise<JobHeader> {
    return this.database.transaction(async (tx) => {
      const job = await findVisibleJob(tx, actor, jobId);
      if (!job) throw jobNotFound();
      if (!canEditJob(actor, job)) throw forbidden();

      // Read status and version again under the row lock: they are what this change builds on.
      const [locked] = await tx
        .select({ status: jobs.status, version: jobs.version, title: jobs.title })
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .for('update');
      if (!locked) throw jobNotFound();

      if (locked.version !== request.version) {
        throw conflict(JOB_VERSION_STALE, 'The job changed since it was loaded');
      }
      if (!canTransition(locked.status, request.to)) {
        throw conflict(
          JOB_STATUS_TRANSITION_INVALID,
          `A ${locked.status} job cannot move to ${request.to}`,
        );
      }
      if (locked.status === 'draft' && request.to === 'open') {
        const [active] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(jobStages)
          .where(and(eq(jobStages.jobId, job.id), isNull(jobStages.retiredAt)));
        if (locked.title.trim() === '' || !active || active.count < 1) {
          throw conflict(JOB_NOT_READY, 'A job needs a title and an active stage to open');
        }
      }

      const [updated] = await tx
        .update(jobs)
        .set({
          status: request.to,
          statusChangedAt: sql`now()`,
          version: sql`${jobs.version} + 1`,
        })
        .where(eq(jobs.id, job.id))
        .returning();
      if (!updated) throw jobNotFound();

      let owner: JobHeader['owner'] = null;
      if (updated.ownerUserId) {
        const [row] = await tx
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(eq(user.id, updated.ownerUserId));
        owner = row ?? null;
      }

      return {
        id: updated.id,
        code: updated.code,
        title: updated.title,
        status: updated.status,
        accessScope: updated.accessScope,
        owner,
        canEdit: true,
        version: updated.version,
      };
    });
  }
}
