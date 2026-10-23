import {
  ACTIVE_JOB_STATUSES,
  JOB_LIST_PAGE_SIZE,
  type JobListQuery,
  type JobListResponse,
  type JobSummary,
} from '@ats/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type JobAccessActor, visibleJobsFilter } from '../access/jobs.access.js';
import { user } from '../auth/auth.schema.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { jobs } from './jobs.schema.js';

@Injectable()
export class JobsListService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * One page of the jobs `actor` may see (decisions §3, §11): the page query and its count, both
   * filtered by `visibleJobsFilter`, so hidden jobs are neither listed nor counted. Newest first,
   * then by code. The owner's name comes from the user row, so a deactivated owner keeps it.
   */
  async list(actor: JobAccessActor, query: JobListQuery): Promise<JobListResponse> {
    const where = and(visibleJobsFilter(actor), statusFilter(query.status), searchFilter(query.q));
    const offset = (query.page - 1) * JOB_LIST_PAGE_SIZE;

    const [rows, [count]] = await Promise.all([
      this.database.db
        .select({
          id: jobs.id,
          code: jobs.code,
          title: jobs.title,
          status: jobs.status,
          ownerId: user.id,
          ownerName: user.name,
        })
        .from(jobs)
        .leftJoin(user, eq(user.id, jobs.ownerUserId))
        .where(where)
        .orderBy(desc(jobs.createdAt), desc(jobs.code))
        .limit(JOB_LIST_PAGE_SIZE)
        .offset(offset),
      this.database.db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(jobs)
        .where(where),
    ]);

    const items: JobSummary[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      owner: row.ownerId === null ? null : { id: row.ownerId, name: row.ownerName ?? '' },
    }));
    return { items, total: count?.total ?? 0, page: query.page, pageSize: JOB_LIST_PAGE_SIZE };
  }
}

/** `active` is every status but Closed (decisions §5). */
function statusFilter(status: JobListQuery['status']): SQL {
  return status === 'active'
    ? inArray(jobs.status, [...ACTIVE_JOB_STATUSES])
    : eq(jobs.status, status);
}

/** Title or code contains `q`, ignoring case and accents (decisions §11); `%` and `_` are literal. */
function searchFilter(q: string | undefined): SQL | undefined {
  if (q === undefined) return undefined;
  const pattern = sql`'%' || unaccent(lower(${escapeLike(q)})) || '%'`;
  return sql`(unaccent(lower(${jobs.title})) ilike ${pattern} or unaccent(lower(${jobs.code})) ilike ${pattern})`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
