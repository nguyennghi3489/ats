import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/database/database.js';
import { testDatabaseUrl } from './support/test-database.js';

describe('testDatabaseUrl', () => {
  it('uses TEST_DATABASE_URL', () => {
    const url = 'postgres://u:p@db:5433/other_test';
    expect(testDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('defaults to the Compose test database', () => {
    expect(testDatabaseUrl({})).toBe('postgres://ats:ats@127.0.0.1:5432/ats_test');
  });

  it('ignores DATABASE_URL', () => {
    expect(
      testDatabaseUrl({ TEST_DATABASE_URL: '', DATABASE_URL: 'postgres://ats:ats@127.0.0.1/ats' }),
    ).toBe('postgres://ats:ats@127.0.0.1:5432/ats_test');
  });

  it('refuses a database whose name does not end in _test', () => {
    expect(() =>
      testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://ats:ats@127.0.0.1/ats' }),
    ).toThrow(/_test/);
  });

  it('refuses the DATABASE_URL database', () => {
    const url = 'postgres://ats:ats@127.0.0.1:5432/ats_test';
    expect(() =>
      testDatabaseUrl({
        TEST_DATABASE_URL: url,
        DATABASE_URL: 'postgres://x:y@127.0.0.1/ats_test',
      }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe('integration test database', () => {
  let database: Database;

  async function rows(): Promise<number> {
    const result = await database.db.execute<{ n: number }>(
      sql`select count(*)::int as n from harness_probe`,
    );
    return result.rows[0]?.n ?? -1;
  }

  beforeAll(async () => {
    database = createDatabase({ url: testDatabaseUrl() });
    await database.db.execute(sql`create table harness_probe (id serial primary key)`);
  });

  afterAll(async () => {
    await database.db.execute(sql`drop table if exists harness_probe`);
    await database.close();
  });

  it('is migrated: unaccent is installed and migrations are recorded', async () => {
    const result = await database.db.execute<{ plain: string; applied: number }>(
      sql`select unaccent(${'Nguyễn Văn Đức'}) as plain,
                 (select count(*)::int from drizzle.__drizzle_migrations) as applied`,
    );
    expect(result.rows[0]?.plain).toBe('Nguyen Van Duc');
    expect(result.rows[0]?.applied).toBeGreaterThanOrEqual(1);
  });

  it('keeps rows written during a test until the test ends', async () => {
    await database.db.execute(sql`insert into harness_probe default values`);
    await database.db.execute(sql`insert into harness_probe default values`);

    expect(await rows()).toBe(2);
  });

  it('starts every test with empty tables and restarted identities', async () => {
    expect(await rows()).toBe(0);

    const inserted = await database.db.execute<{ id: number }>(
      sql`insert into harness_probe default values returning id`,
    );
    expect(inserted.rows).toEqual([{ id: 1 }]);
  });
});
