import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.js';

// Integration tests against the Compose Postgres test database (`docker compose up -d --wait postgres`).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://ats:ats@127.0.0.1:5432/ats_test';
// Nothing listens on port 1, so connecting fails at once: stands in for "Postgres stopped".
const unreachableUrl = 'postgres://ats:ats@127.0.0.1:1/ats_test';

describe('database client', () => {
  let database: Database;
  // A table per run, so parallel runs never see each other's rows.
  const table = sql.identifier(`tx_probe_${randomUUID().replaceAll('-', '')}`);

  async function count(): Promise<number> {
    const result = await database.db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${table}`,
    );
    return result.rows[0]?.n ?? -1;
  }

  beforeAll(async () => {
    database = createDatabase({ url: testDatabaseUrl });
    await database.db.execute(sql`create table ${table} (id int primary key)`);
  });

  afterAll(async () => {
    await database.db.execute(sql`drop table if exists ${table}`);
    await database.close();
  });

  it('runs queries', async () => {
    const result = await database.db.execute<{ answer: number }>(sql`select 42 as answer`);
    expect(result.rows).toEqual([{ answer: 42 }]);
  });

  it('commits what transaction(fn) wrote and returns its result', async () => {
    const result = await database.transaction(async (tx) => {
      await tx.execute(sql`insert into ${table} (id) values (1)`);
      return 'done';
    });

    expect(result).toBe('done');
    expect(await count()).toBe(1);
  });

  it('rolls back everything transaction(fn) wrote when fn throws, and rethrows', async () => {
    const before = await count();

    await expect(
      database.transaction(async (tx) => {
        await tx.execute(sql`insert into ${table} (id) values (2)`);
        await tx.execute(sql`insert into ${table} (id) values (3)`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await count()).toBe(before);
  });

  it('reports the database as reachable', async () => {
    expect(await database.isReachable()).toBe(true);
  });

  it('reports an unreachable database without throwing', async () => {
    const down = createDatabase({ url: unreachableUrl });
    try {
      expect(await down.isReachable()).toBe(false);
    } finally {
      await down.close();
    }
  });
});
