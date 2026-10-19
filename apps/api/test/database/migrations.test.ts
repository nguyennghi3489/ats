import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { resetDatabase, runMigrations } from '../../src/database/migrations.js';
import {
  testDatabaseUrl as testDatabaseUrlFromEnv,
  withDatabaseName,
} from '../support/test-database.js';

// Each run creates its own empty database next to the test database and drops it afterwards,
// so these tests never touch the schema the rest of the suite migrated.
const testDatabaseUrl = testDatabaseUrlFromEnv();

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe('migrations', () => {
  const name = `ats_migrate_${randomUUID().replaceAll('-', '')}`;
  const url = withDatabaseName(testDatabaseUrl, name);
  let database: Database;

  async function appliedCount(): Promise<number> {
    const result = await database.db.execute<{ n: number }>(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    return result.rows[0]?.n ?? -1;
  }

  async function hasUnaccent(): Promise<boolean> {
    const result = await database.db.execute(
      sql`select 1 from pg_extension where extname = 'unaccent'`,
    );
    return result.rows.length === 1;
  }

  beforeAll(async () => {
    await admin((client) => client.query(`create database "${name}"`));
    database = createDatabase({ url });
  });

  afterAll(async () => {
    await database.close();
    await admin((client) => client.query(`drop database if exists "${name}" with (force)`));
  });

  it('applies every migration on an empty database', async () => {
    expect(await hasUnaccent()).toBe(false);

    await runMigrations(url);

    expect(await appliedCount()).toBeGreaterThanOrEqual(1);
    expect(await hasUnaccent()).toBe(true);
  });

  it('is a no-op when run again', async () => {
    const before = await appliedCount();

    await runMigrations(url);

    expect(await appliedCount()).toBe(before);
  });

  it('makes unaccent available through the API client', async () => {
    const result = await database.db.execute<{ plain: string }>(
      sql`select unaccent(${'Đề nghị'}) as plain`,
    );
    expect(result.rows).toEqual([{ plain: 'De nghi' }]);
  });

  it('resets the database: drops everything, then migrates again', async () => {
    await database.db.execute(sql`create table leftover (id int)`);

    await resetDatabase(url, 'development');

    const leftover = await database.db.execute(sql`select to_regclass('public.leftover') as t`);
    expect(leftover.rows).toEqual([{ t: null }]);
    expect(await hasUnaccent()).toBe(true);
    expect(await appliedCount()).toBeGreaterThanOrEqual(1);
  });

  it('refuses to reset a production database', async () => {
    await database.db.execute(sql`create table survivor (id int)`);

    await expect(resetDatabase(url, 'production')).rejects.toThrow(/production/);

    const survivor = await database.db.execute(sql`select to_regclass('public.survivor') as t`);
    expect(survivor.rows).toEqual([{ t: 'survivor' }]);
  });
});
