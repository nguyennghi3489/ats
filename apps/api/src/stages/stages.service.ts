import type { JobStages } from '@ats/shared';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { canEditJob, findVisibleJob, type JobAccessActor } from '../access/jobs.access.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { jobStages } from '../jobs/jobs.schema.js';

@Injectable()
export class StagesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * The stages of `jobId` as `actor` sees them, or `null` when the job does not exist, is hidden
   * from the actor, belongs to another workspace or `jobId` is not a uuid (decisions §3). One
   * statement for the job (through the visibility filter), one for its stages.
   */
  async find(actor: JobAccessActor, jobId: string): Promise<JobStages | null> {
    const job = await findVisibleJob(this.database.db, actor, jobId);
    if (!job) return null;

    const rows = await this.database.db
      .select({
        id: jobStages.id,
        name: jobStages.name,
        position: jobStages.position,
        retiredAt: jobStages.retiredAt,
      })
      .from(jobStages)
      .where(eq(jobStages.jobId, job.id))
      .orderBy(asc(jobStages.position), asc(jobStages.id));

    const active: JobStages['active'] = [];
    const retired: { id: string; name: string; retiredAt: Date }[] = [];
    for (const { id, name, position, retiredAt } of rows) {
      if (retiredAt) retired.push({ id, name, retiredAt });
      else active.push({ id, name, position });
    }
    retired.sort((a, b) => b.retiredAt.getTime() - a.retiredAt.getTime());

    return {
      jobId: job.id,
      version: job.version,
      canEdit: canEditJob(actor, job),
      active,
      retired: retired.map(({ id, name, retiredAt }) => ({
        id,
        name,
        retiredAt: retiredAt.toISOString(),
      })),
    };
  }
}
