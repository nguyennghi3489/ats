import { randomUUID } from 'node:crypto';
import type { JobLocation } from '@ats/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organization, user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobStages, jobs } from '../../src/database/schema.js';
import { testDatabaseUrl } from '../support/test-database.js';

/** The Postgres error of a rejected statement, as drizzle wraps it. */
async function pgError(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return cause as { code?: string; constraint?: string };
  }
  throw new Error('expected the statement to fail');
}

describe('jobs tables', () => {
  let database: Database;

  beforeAll(() => {
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
  });

  afterAll(async () => {
    await database.close();
  });

  async function createUser(name = 'Lan'): Promise<string> {
    const id = randomUUID();
    await database.db.insert(user).values({ id, name, email: `${id}@example.test` });
    return id;
  }

  async function createWorkspace(name = 'An Nhiên'): Promise<string> {
    const id = randomUUID();
    await database.db.insert(organization).values({ id, name, slug: id, codePrefix: 'AN' });
    return id;
  }

  async function createJob(workspaceId: string, createdBy: string, code = 'AN-001') {
    const [job] = await database.db
      .insert(jobs)
      .values({ workspaceId, code, title: 'Kỹ sư phần mềm', createdBy })
      .returning();
    if (!job) throw new Error('no job returned');
    return job;
  }

  it('creates a job with the documented defaults', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();

    const job = await createJob(workspaceId, userId);

    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(job).toMatchObject({
      workspaceId,
      code: 'AN-001',
      title: 'Kỹ sư phần mềm',
      status: 'draft',
      accessScope: 'normal',
      ownerUserId: null,
      createdBy: userId,
      locations: [],
      version: 1,
    });
    expect(job.statusChangedAt).toBeInstanceOf(Date);
    expect(job.createdAt).toBeInstanceOf(Date);
    expect(job.updatedAt).toBeInstanceOf(Date);
  });

  it('stores locations as JSON rows', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();
    const locations: JobLocation[] = [{ country: 'VN', city: 'Hà Nội' }, { country: 'SG' }];

    const [job] = await database.db
      .insert(jobs)
      .values({ workspaceId, code: 'AN-001', title: 'Kế toán', createdBy: userId, locations })
      .returning();

    expect(job?.locations).toEqual(locations);
  });

  it('rejects two jobs with the same code in one workspace', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();
    await createJob(workspaceId, userId, 'AN-001');

    const error = await pgError(createJob(workspaceId, userId, 'AN-001'));

    expect(error.code).toBe('23505');
    expect(error.constraint).toBe('jobs_workspace_id_code_unique');
  });

  it('accepts the same code in two workspaces', async () => {
    const userId = await createUser();
    const first = await createWorkspace('An Nhiên');
    const second = await createWorkspace('Ánh Nắng');

    await createJob(first, userId, 'AN-001');
    await createJob(second, userId, 'AN-001');

    const rows = await database.db.select().from(jobs);
    expect(rows).toHaveLength(2);
  });

  it('rejects an unknown status or access scope', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();
    const job = await createJob(workspaceId, userId);

    const status = await pgError(
      database.db.execute(sql`update jobs set status = 'archived' where id = ${job.id}`),
    );
    const scope = await pgError(
      database.db.execute(sql`update jobs set access_scope = 'private' where id = ${job.id}`),
    );

    expect(status.code).toBe('23514');
    expect(status.constraint).toBe('jobs_status_check');
    expect(scope.code).toBe('23514');
    expect(scope.constraint).toBe('jobs_access_scope_check');
  });

  it('rejects deleting a user referenced as created_by and keeps the job', async () => {
    const creatorId = await createUser('Lan');
    const workspaceId = await createWorkspace();
    const job = await createJob(workspaceId, creatorId);

    const error = await pgError(database.db.delete(user).where(eq(user.id, creatorId)));

    // 23001 restrict_violation: the foreign key is ON DELETE RESTRICT.
    expect(error.code).toBe('23001');
    expect(error.constraint).toBe('jobs_created_by_user_id_fk');
    const rows = await database.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdBy).toBe(creatorId);
  });

  it('clears the owner when the owner user is deleted', async () => {
    const creatorId = await createUser('Lan');
    const ownerId = await createUser('Minh');
    const workspaceId = await createWorkspace();
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId,
        code: 'AN-001',
        title: 'Kế toán',
        createdBy: creatorId,
        ownerUserId: ownerId,
      })
      .returning();

    await database.db.delete(user).where(eq(user.id, ownerId));

    const [row] = await database.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, job?.id ?? ''));
    expect(row?.ownerUserId).toBeNull();
  });

  it('stores stages per job with a position and an optional retirement time', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();
    const job = await createJob(workspaceId, userId);

    await database.db.insert(jobStages).values([
      { jobId: job.id, name: 'Mới', position: 0 },
      { jobId: job.id, name: 'Sơ loại', position: 1, retiredAt: new Date() },
    ]);

    const stages = await database.db
      .select()
      .from(jobStages)
      .where(eq(jobStages.jobId, job.id))
      .orderBy(jobStages.position);
    expect(stages.map((stage) => stage.name)).toEqual(['Mới', 'Sơ loại']);
    expect(stages[0]?.retiredAt).toBeNull();
    expect(stages[1]?.retiredAt).toBeInstanceOf(Date);
    expect(stages[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a stage of a job that does not exist', async () => {
    const error = await pgError(
      database.db.insert(jobStages).values({ jobId: randomUUID(), name: 'Mới', position: 0 }),
    );

    expect(error.code).toBe('23503');
  });

  it('assigns a user to a job at most once', async () => {
    const userId = await createUser();
    const workspaceId = await createWorkspace();
    const job = await createJob(workspaceId, userId);

    await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    const error = await pgError(
      database.db.insert(jobAssignments).values({ jobId: job.id, userId }),
    );

    expect(error.code).toBe('23505');
    expect(error.constraint).toBe('job_assignments_job_id_user_id_pk');
  });

  it('has the indexes the list queries rely on', async () => {
    const result = await database.db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename in ('jobs', 'job_stages') order by indexname`,
    );

    expect(result.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'jobs_workspace_id_code_unique',
        'jobs_workspace_id_status_idx',
        'job_stages_job_id_position_idx',
      ]),
    );
  });
});
