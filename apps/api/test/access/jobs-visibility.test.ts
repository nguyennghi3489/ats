import { randomUUID } from 'node:crypto';
import type { JobAccessScope, WorkspaceRole } from '@ats/shared';
import { HttpException } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  canEditJob,
  canViewJob,
  findVisibleJob,
  type JobAccessActor,
  jobNotFound,
  visibleJobsFilter,
} from '../../src/access/index.js';
import { createDatabase, type Database, type DatabaseClient } from '../../src/database/database.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { testDatabaseUrl } from '../support/test-database.js';
import { accessFixtures } from './fixtures.js';

const ROLES: WorkspaceRole[] = ['admin', 'recruiter', 'collaborator'];

describe('job visibility against Postgres', () => {
  let database: Database;
  let db: DatabaseClient;
  let fixtures: ReturnType<typeof accessFixtures>;

  beforeAll(() => {
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    db = database.db;
    fixtures = accessFixtures(db);
  });

  afterAll(async () => {
    await database.close();
  });

  let workspaceId: string;
  let creatorId: string;
  let codeNumber: number;

  beforeEach(async () => {
    workspaceId = await fixtures.workspace();
    creatorId = (await fixtures.user()).id;
    await fixtures.member(workspaceId, creatorId, 'admin');
    codeNumber = 0;
  });

  async function createJob(
    accessScope: JobAccessScope,
    options: { workspaceId?: string; assign?: string[]; title?: string } = {},
  ): Promise<string> {
    codeNumber += 1;
    const [job] = await db
      .insert(jobs)
      .values({
        workspaceId: options.workspaceId ?? workspaceId,
        code: `MS-${String(codeNumber).padStart(3, '0')}`,
        title: options.title ?? `Chuyên viên ${codeNumber}`,
        accessScope,
        createdBy: creatorId,
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error('no job returned');
    for (const userId of options.assign ?? []) {
      await db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return job.id;
  }

  async function memberActor(role: WorkspaceRole, inWorkspace = workspaceId) {
    const { id } = await fixtures.user();
    await fixtures.member(inWorkspace, id, role);
    const actor: JobAccessActor = { user: { id }, workspaceId: inWorkspace, role };
    return actor;
  }

  async function visibleIds(actor: JobAccessActor): Promise<string[]> {
    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(visibleJobsFilter(actor))
      .orderBy(asc(jobs.code));
    return rows.map((row) => row.id);
  }

  it('shows a recruiter two, an assigned collaborator one and an admin all three jobs', async () => {
    const admin = await memberActor('admin');
    const recruiter = await memberActor('recruiter');
    const collaborator = await memberActor('collaborator');
    const normal = await createJob('normal', { assign: [collaborator.user.id] });
    const restrictedAssigned = await createJob('restricted', { assign: [recruiter.user.id] });
    const restrictedUnassigned = await createJob('restricted');

    expect(await visibleIds(recruiter)).toEqual([normal, restrictedAssigned]);
    expect(await visibleIds(collaborator)).toEqual([normal]);
    expect(await visibleIds(admin)).toEqual([normal, restrictedAssigned, restrictedUnassigned]);
  });

  it('agrees with canViewJob and canEditJob on every cell of the role table', async () => {
    for (const role of ROLES) {
      const actor = await memberActor(role);
      for (const scope of ['normal', 'restricted'] as const) {
        for (const assigned of [false, true]) {
          const jobId = await createJob(scope, { assign: assigned ? [actor.user.id] : [] });
          const facts = { workspaceId, accessScope: scope, assignedToActor: assigned };
          const found = await findVisibleJob(db, actor, jobId);
          const cell = `${role} / ${scope} / assigned: ${assigned}`;

          expect(found !== null, cell).toBe(canViewJob(actor, facts));
          if (found) {
            expect(found.assignedToActor, cell).toBe(assigned);
            expect(canEditJob(actor, found), cell).toBe(canEditJob(actor, facts));
          }
        }
      }
    }
  });

  it('never returns jobs of another workspace, for any role', async () => {
    const otherWorkspace = await fixtures.workspace('Biển Xanh');
    for (const role of ROLES) {
      const actor = await memberActor(role);
      // Assigned to the actor and normal: the most visible a foreign job can be.
      const foreignNormal = await createJob('normal', {
        workspaceId: otherWorkspace,
        assign: [actor.user.id],
      });
      const foreignRestricted = await createJob('restricted', {
        workspaceId: otherWorkspace,
        assign: [actor.user.id],
      });

      const ids = await visibleIds(actor);
      expect(ids, role).not.toContain(foreignNormal);
      expect(ids, role).not.toContain(foreignRestricted);
      expect(await findVisibleJob(db, actor, foreignNormal), role).toBeNull();
      expect(await findVisibleJob(db, actor, foreignRestricted), role).toBeNull();
    }
  });

  it('returns the full job row for a visible job', async () => {
    const recruiter = await memberActor('recruiter');
    const jobId = await createJob('normal', { title: 'Kế toán trưởng' });

    expect(await findVisibleJob(db, recruiter, jobId)).toMatchObject({
      id: jobId,
      workspaceId,
      code: 'MS-001',
      title: 'Kế toán trưởng',
      accessScope: 'normal',
      status: 'draft',
      assignedToActor: false,
    });
  });

  it('returns null for a hidden job and for a random uuid, which callers answer alike', async () => {
    const recruiter = await memberActor('recruiter');
    const hidden = await createJob('restricted');

    const hiddenResult = await findVisibleJob(db, recruiter, hidden);
    const missingResult = await findVisibleJob(db, recruiter, randomUUID());
    const malformedResult = await findVisibleJob(db, recruiter, 'not-a-uuid');
    expect(hiddenResult).toBeNull();
    expect(missingResult).toBeNull();
    expect(malformedResult).toBeNull();

    // What a route does with `null`: the same status and body whatever the reason.
    const answer = (job: unknown) => {
      const error: HttpException | null = job === null ? jobNotFound() : null;
      return error && { status: error.getStatus(), body: error.getResponse() };
    };
    expect(answer(hiddenResult)).toEqual({
      status: 404,
      body: { code: 'JOB_NOT_FOUND', message: 'Job not found' },
    });
    expect(answer(missingResult)).toEqual(answer(hiddenResult));
    expect(answer(malformedResult)).toEqual(answer(hiddenResult));
  });
});
