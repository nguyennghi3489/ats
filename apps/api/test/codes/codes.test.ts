import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organization, user } from '../../src/auth/auth.schema.js';
import { CodesService } from '../../src/codes/codes.service.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobs } from '../../src/database/schema.js';
import { testDatabaseUrl } from '../support/test-database.js';

const CONCURRENT = 20;

// Per-workspace code counters (decisions §5) against the Compose test Postgres: each call takes the
// next number of its workspace and kind inside the caller's transaction.
describe('CodesService.nextCode', () => {
  let database: Database;
  const codes = new CodesService();

  beforeAll(() => {
    // One connection per concurrent transaction, plus one for the assertions.
    database = createDatabase({ url: testDatabaseUrl(), max: CONCURRENT + 1 });
  });

  afterAll(async () => {
    await database.close();
  });

  async function createWorkspace(codePrefix: string): Promise<string> {
    const id = randomUUID();
    await database.db
      .insert(organization)
      .values({ id, name: `Workspace ${codePrefix}`, slug: id, codePrefix });
    return id;
  }

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await database.db.insert(user).values({ id, name: 'Lan', email: `${id}@example.test` });
    return id;
  }

  async function counter(workspaceId: string, kind: string): Promise<number | undefined> {
    const result = await database.db.execute<{ last_value: number }>(
      sql`select last_value from workspace_counters
          where workspace_id = ${workspaceId} and kind = ${kind}`,
    );
    return result.rows[0]?.last_value;
  }

  it('numbers job codes from {PREFIX}-001 and application codes from ỨT-001, independently', async () => {
    const workspaceId = await createWorkspace('AN');
    const take = (kind: 'job' | 'application') =>
      database.transaction((tx) => codes.nextCode(tx, workspaceId, kind));

    expect(await take('job')).toBe('AN-001');
    expect(await take('job')).toBe('AN-002');
    expect(await take('application')).toBe('ỨT-001');
    expect(await take('job')).toBe('AN-003');
    expect(await take('application')).toBe('ỨT-002');

    expect(await counter(workspaceId, 'job')).toBe(3);
    expect(await counter(workspaceId, 'application')).toBe(2);
  });

  it('keeps an independent counter per workspace', async () => {
    const an = await createWorkspace('AN');
    const ms = await createWorkspace('MS');
    const take = (workspaceId: string, kind: 'job' | 'application') =>
      database.transaction((tx) => codes.nextCode(tx, workspaceId, kind));

    expect(await take(an, 'job')).toBe('AN-001');
    expect(await take(an, 'job')).toBe('AN-002');
    expect(await take(ms, 'job')).toBe('MS-001');
    expect(await take(ms, 'application')).toBe('ỨT-001');
    expect(await take(an, 'application')).toBe('ỨT-001');
    expect(await take(an, 'job')).toBe('AN-003');
  });

  it(`gives ${CONCURRENT} concurrent transactions ${CONCURRENT} distinct consecutive codes`, async () => {
    const workspaceId = await createWorkspace('AN');
    const createdBy = await createUser();

    const taken = await Promise.all(
      Array.from({ length: CONCURRENT }, (_, i) =>
        database.transaction(async (tx) => {
          const code = await codes.nextCode(tx, workspaceId, 'job');
          // Hold the transaction open a little so the others really queue behind it.
          await tx.execute(sql`select pg_sleep(${(i % 4) * 0.01})`);
          await tx.insert(jobs).values({ workspaceId, code, title: `Job ${i}`, createdBy });
          return code;
        }),
      ),
    );

    const expected = Array.from(
      { length: CONCURRENT },
      (_, i) => `AN-${String(i + 1).padStart(3, '0')}`,
    );
    expect([...taken].sort()).toEqual(expected);
    expect(await counter(workspaceId, 'job')).toBe(CONCURRENT);
  });

  it('never lets two committed records hold the same code; a rolled-back code is handed out again', async () => {
    const workspaceId = await createWorkspace('AN');
    const createdBy = await createUser();
    const createJob = (fail: boolean) =>
      database.transaction(async (tx) => {
        const code = await codes.nextCode(tx, workspaceId, 'job');
        await tx.insert(jobs).values({ workspaceId, code, title: 'Kỹ sư', createdBy });
        if (fail) throw new Error('job creation failed');
        return code;
      });

    expect(await createJob(false)).toBe('AN-001');
    await expect(createJob(true)).rejects.toThrow('job creation failed');
    // The increment rolls back with the transaction (decisions §5: same transaction as the insert),
    // so the number the failed job took was never committed and goes to the next job: no gap.
    expect(await createJob(false)).toBe('AN-002');
    await expect(createJob(true)).rejects.toThrow('job creation failed');
    expect(await createJob(false)).toBe('AN-003');

    const stored = await database.db.execute<{ code: string }>(
      sql`select code from jobs where workspace_id = ${workspaceId} order by code`,
    );
    expect(stored.rows.map((row) => row.code)).toEqual(['AN-001', 'AN-002', 'AN-003']);
    expect(await counter(workspaceId, 'job')).toBe(3);
  });

  it('rolls the counter back with a failed savepoint while the outer transaction commits', async () => {
    const workspaceId = await createWorkspace('AN');

    const result = await database.transaction(async (tx) => {
      const first = await codes.nextCode(tx, workspaceId, 'job');
      await expect(
        tx.transaction(async (inner) => {
          await codes.nextCode(inner, workspaceId, 'job');
          throw new Error('inner failed');
        }),
      ).rejects.toThrow('inner failed');
      const second = await codes.nextCode(tx, workspaceId, 'job');
      return [first, second];
    });

    expect(result).toEqual(['AN-001', 'AN-002']);
    expect(await counter(workspaceId, 'job')).toBe(2);
  });

  it('deletes the counters with their workspace', async () => {
    const workspaceId = await createWorkspace('AN');
    await database.transaction((tx) => codes.nextCode(tx, workspaceId, 'job'));

    await database.db.execute(sql`delete from organization where id = ${workspaceId}`);

    expect(await counter(workspaceId, 'job')).toBeUndefined();
  });

  it('refuses a counter kind the table does not know', async () => {
    const workspaceId = await createWorkspace('AN');
    await expect(
      database.db.execute(
        sql`insert into workspace_counters (workspace_id, kind, last_value)
            values (${workspaceId}, 'candidate', 1)`,
      ),
    ).rejects.toThrow();
  });

  it('throws for a workspace that does not exist and creates no counter', async () => {
    const missing = randomUUID();
    await expect(
      database.transaction((tx) => codes.nextCode(tx, missing, 'job')),
    ).rejects.toThrow();
    expect(await counter(missing, 'job')).toBeUndefined();
  });
});
