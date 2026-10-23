import type { JobHeader } from '@ats/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { canEditJob, findVisibleJob, type JobAccessActor } from '../access/jobs.access.js';
import { user } from '../auth/auth.schema.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';

@Injectable()
export class JobHeaderService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * The job page header of `jobId` as `actor` sees it, or `null` when the job does not exist, is
   * hidden from the actor, belongs to another workspace or `jobId` is not a uuid (decisions §3).
   */
  async find(actor: JobAccessActor, jobId: string): Promise<JobHeader | null> {
    const job = await findVisibleJob(this.database.db, actor, jobId);
    if (!job) return null;

    let owner: JobHeader['owner'] = null;
    if (job.ownerUserId) {
      const [row] = await this.database.db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.id, job.ownerUserId));
      owner = row ?? null;
    }

    return {
      id: job.id,
      code: job.code,
      title: job.title,
      status: job.status,
      accessScope: job.accessScope,
      owner,
      canEdit: canEditJob(actor, job),
    };
  }
}
