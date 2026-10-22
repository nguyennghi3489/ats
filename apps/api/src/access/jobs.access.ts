// The job record rules (decisions §3): who sees which jobs and who may change them. Every jobs
// query filters with `visibleJobsFilter`; every jobs action asks `canEditJob` / `canCreateJob`.
import { FORBIDDEN, JOB_NOT_FOUND, type JobAccessScope } from '@ats/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq, or, type SQL, sql } from 'drizzle-orm';
import type { DatabaseClient } from '../database/database.js';
import { jobAssignments, jobs } from '../jobs/jobs.schema.js';
import type { WorkspaceActor } from './resolve-access.js';

/** What the job rules need to know about the caller (a `WorkspaceActor` fits). */
export interface JobAccessActor {
  user: Pick<WorkspaceActor['user'], 'id'>;
  workspaceId: WorkspaceActor['workspaceId'];
  role: WorkspaceActor['role'];
}

/** What the job rules need to know about a job, as seen by one actor. */
export interface JobAccessFacts {
  workspaceId: string;
  accessScope: JobAccessScope;
  /** Whether the actor is in the job's `job_assignments`. */
  assignedToActor: boolean;
}

/** A job loaded through `visibleJobsFilter`, with whether the actor is assigned to it. */
export type VisibleJob = typeof jobs.$inferSelect & { assignedToActor: boolean };

/** `true` when the actor is assigned to the `jobs` row of the surrounding query. */
function assignedTo(userId: string): SQL {
  return sql`exists (select 1 from ${jobAssignments} where ${jobAssignments.jobId} = ${jobs.id} and ${jobAssignments.userId} = ${userId})`;
}

/**
 * The jobs the actor can see, as a condition on `jobs` for the data query itself. Always scoped
 * to the actor's workspace. Admins see every job; recruiters every normal job and the restricted
 * ones they are assigned to; collaborators only the jobs they are assigned to.
 */
export function visibleJobsFilter(actor: JobAccessActor): SQL {
  const inWorkspace = eq(jobs.workspaceId, actor.workspaceId);
  switch (actor.role) {
    case 'admin':
      return inWorkspace;
    case 'recruiter':
      return and(inWorkspace, or(eq(jobs.accessScope, 'normal'), assignedTo(actor.user.id))) as SQL;
    case 'collaborator':
      return and(inWorkspace, assignedTo(actor.user.id)) as SQL;
  }
}

/** The same rule as `visibleJobsFilter`, for a job already in memory. */
export function canViewJob(actor: JobAccessActor, job: JobAccessFacts): boolean {
  if (job.workspaceId !== actor.workspaceId) return false;
  switch (actor.role) {
    case 'admin':
      return true;
    case 'recruiter':
      return job.accessScope === 'normal' || job.assignedToActor;
    case 'collaborator':
      return job.assignedToActor;
  }
}

/**
 * Edit content, plan, stages, status, budget: admins and recruiters, on any job they can see.
 * Collaborators are read-only.
 */
export function canEditJob(actor: JobAccessActor, job: JobAccessFacts): boolean {
  return actor.role !== 'collaborator' && canViewJob(actor, job);
}

/** Create a job: admins and recruiters. */
export function canCreateJob(actor: JobAccessActor): boolean {
  return actor.role === 'admin' || actor.role === 'recruiter';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One job, loaded through `visibleJobsFilter`. `null` when it does not exist, is hidden from the
 * actor, or `jobId` is not a uuid: callers answer all three with the same `jobNotFound()`.
 */
export async function findVisibleJob(
  db: DatabaseClient,
  actor: JobAccessActor,
  jobId: string,
): Promise<VisibleJob | null> {
  if (!UUID.test(jobId)) return null;
  const [row] = await db
    .select({
      job: jobs,
      assignedToActor: sql<boolean>`${assignedTo(actor.user.id)}`.mapWith(Boolean),
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), visibleJobsFilter(actor)));
  return row ? { ...row.job, assignedToActor: row.assignedToActor } : null;
}

/** 404 `JOB_NOT_FOUND`: the one answer for a missing job and a hidden one. */
export function jobNotFound(): NotFoundException {
  return new NotFoundException({ code: JOB_NOT_FOUND, message: 'Job not found' });
}

/** 403 `FORBIDDEN`: the actor sees the job, but their role may not do this to it. */
export function forbidden(): ForbiddenException {
  return new ForbiddenException({ code: FORBIDDEN, message: 'Forbidden' });
}
