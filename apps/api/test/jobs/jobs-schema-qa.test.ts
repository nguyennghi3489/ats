import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { member, organization, session, user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { runMigrations } from '../../src/database/migrations.js';
import { jobAssignments, jobStages, jobs } from '../../src/database/schema.js';
import { testDatabaseUrl, withDatabaseName } from '../support/test-database.js';

// QA for #123: the migration on an empty database, and history kept when a workspace's member is
// deleted while referenced as created_by.

async function pgError(promise: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return cause as { code?: string; constraint?: string };
  }
  throw new Error('expected the statement to fail');
}

describe('QA #123: migrating an empty database', () => {
  const url = testDatabaseUrl();
  const name = `ats_qa_jobs_${randomUUID().replaceAll('-', '')}`;
  const emptyUrl = withDatabaseName(url, name);
  let database: Database;

  async function admin(query: string): Promise<void> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query(query);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await admin(`create database "${name}"`);
    database = createDatabase({ url: emptyUrl, max: 1 });
  });

  afterAll(async () => {
    await database.close();
    await admin(`drop database if exists "${name}" with (force)`);
  });

  it('creates jobs, job_stages and job_assignments with the documented columns', async () => {
    const before = await database.db.execute<{ t: string | null }>(
      sql`select to_regclass('public.jobs')::text as t`,
    );
    expect(before.rows).toEqual([{ t: null }]);

    await runMigrations(emptyUrl);

    const columns = await database.db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('jobs', 'job_stages', 'job_assignments')
          order by table_name, ordinal_position`,
    );
    const byTable = (table: string) =>
      columns.rows.filter((row) => row.table_name === table).map((row) => row.column_name);

    expect(byTable('jobs')).toEqual([
      'id',
      'workspace_id',
      'code',
      'title',
      'status',
      'access_scope',
      'owner_user_id',
      'created_by',
      'locations',
      'version',
      'status_changed_at',
      'created_at',
      'updated_at',
    ]);
    expect(byTable('job_stages')).toEqual([
      'id',
      'job_id',
      'name',
      'position',
      'retired_at',
      'created_at',
    ]);
    expect(byTable('job_assignments')).toEqual(['job_id', 'user_id', 'created_at']);

    const pk = await database.db.execute<{ column_name: string }>(
      sql`select a.attname as column_name
          from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = 'public.job_assignments'::regclass and i.indisprimary
          order by a.attname`,
    );
    expect(pk.rows.map((row) => row.column_name)).toEqual(['job_id', 'user_id']);
  });
});

describe('QA #123: deleting a workspace member referenced as created_by', () => {
  let database: Database;

  beforeAll(() => {
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
  });

  afterAll(async () => {
    await database.close();
  });

  async function seed() {
    const creatorId = randomUUID();
    const workspaceId = randomUUID();
    await database.db
      .insert(user)
      .values({ id: creatorId, name: 'Lan', email: `${creatorId}@example.test` });
    await database.db
      .insert(organization)
      .values({ id: workspaceId, name: 'An Nhiên', slug: workspaceId, codePrefix: 'AN' });
    await database.db
      .insert(member)
      .values({ id: randomUUID(), organizationId: workspaceId, userId: creatorId, role: 'admin' });
    await database.db.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: creatorId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [job] = await database.db
      .insert(jobs)
      .values({ workspaceId, code: 'AN-001', title: 'Kỹ sư phần mềm', createdBy: creatorId })
      .returning();
    if (!job) throw new Error('no job');
    await database.db.insert(jobStages).values({ jobId: job.id, name: 'Mới', position: 0 });
    await database.db.insert(jobAssignments).values({ jobId: job.id, userId: creatorId });
    return { creatorId, workspaceId, job };
  }

  it('rejects the delete and leaves the user, membership, session, job, stages and assignment', async () => {
    const { creatorId, job } = await seed();

    const error = await pgError(database.db.delete(user).where(eq(user.id, creatorId)));

    expect(error.code).toBe('23001');
    expect(error.constraint).toBe('jobs_created_by_user_id_fk');
    expect(await database.db.select().from(user).where(eq(user.id, creatorId))).toHaveLength(1);
    expect(
      await database.db.select().from(member).where(eq(member.userId, creatorId)),
    ).toHaveLength(1);
    expect(
      await database.db.select().from(session).where(eq(session.userId, creatorId)),
    ).toHaveLength(1);
    expect(await database.db.select().from(jobs).where(eq(jobs.id, job.id))).toHaveLength(1);
    expect(
      await database.db.select().from(jobStages).where(eq(jobStages.jobId, job.id)),
    ).toHaveLength(1);
    expect(
      await database.db.select().from(jobAssignments).where(eq(jobAssignments.jobId, job.id)),
    ).toHaveLength(1);
  });

  it('removes only the assignment when an assigned, non-creator user is deleted', async () => {
    const { job } = await seed();
    const otherId = randomUUID();
    await database.db
      .insert(user)
      .values({ id: otherId, name: 'Minh', email: `${otherId}@example.test` });
    await database.db.insert(jobAssignments).values({ jobId: job.id, userId: otherId });

    await database.db.delete(user).where(eq(user.id, otherId));

    const assignments = await database.db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, job.id));
    expect(assignments.map((row) => row.userId)).not.toContain(otherId);
    expect(assignments).toHaveLength(1);
    expect(await database.db.select().from(jobs).where(eq(jobs.id, job.id))).toHaveLength(1);
  });

  it('rejects a job with a null status', async () => {
    const { workspaceId, creatorId } = await seed();

    const error = await pgError(
      database.db.execute(
        sql`insert into jobs (workspace_id, code, title, created_by, status)
            values (${workspaceId}, 'AN-002', 'Kế toán', ${creatorId}, null)`,
      ),
    );

    expect(error.code).toBe('23502');
  });
});
