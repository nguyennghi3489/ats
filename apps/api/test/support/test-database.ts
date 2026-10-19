import { sql } from 'drizzle-orm';
import type { Database } from '../../src/database/database.js';

/** Default: the Compose `ats_test` database, created by docker/postgres/init. */
const DEFAULT_TEST_DATABASE_URL = 'postgres://ats:ats@127.0.0.1:5432/ats_test';

/**
 * The database integration tests run against: `TEST_DATABASE_URL`, never `DATABASE_URL`.
 * Throws unless the database name ends in `_test` and differs from `DATABASE_URL`'s, because the
 * suite drops and truncates everything in it.
 */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test", got "${name}"`);
  }
  if (env.DATABASE_URL && sameDatabase(url, env.DATABASE_URL)) {
    throw new Error('TEST_DATABASE_URL must not point at the DATABASE_URL database');
  }
  return url;
}

/** The URL of another database on the same server as `url` (for tests that create their own). */
export function withDatabaseName(url: string, name: string): string {
  return Object.assign(new URL(url), { pathname: `/${name}` }).toString();
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function sameDatabase(a: string, b: string): boolean {
  const left = new URL(a);
  const right = new URL(b);
  return (
    left.hostname === right.hostname &&
    (left.port || '5432') === (right.port || '5432') &&
    databaseName(a) === databaseName(b)
  );
}

/**
 * Empties every table in the `public` schema and restarts identities. Run before each test so it
 * starts from the freshly migrated, empty schema. Migration history (`drizzle` schema) is kept.
 */
export async function truncateAllTables(database: Database): Promise<void> {
  const result = await database.db.execute<{ name: string }>(
    sql`select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  );
  if (result.rows.length === 0) {
    return;
  }
  const tables = result.rows.map((row) => `public.${row.name}`).join(', ');
  await database.db.execute(sql.raw(`truncate table ${tables} restart identity cascade`));
}
