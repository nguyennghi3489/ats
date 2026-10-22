import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DatabaseClient } from '../../src/database/database.js';
import { testDatabaseUrl } from './test-database.js';

/** A Drizzle client on the test database that counts every statement sent to Postgres. */
export interface CountingDatabase {
  readonly db: DatabaseClient;
  /** Statements sent since creation or the last `reset()`. */
  readonly queries: number;
  reset(): void;
  close(): Promise<void>;
}

/**
 * Counts at the connection level (every `client.query`, whether it comes from `pool.query`, a
 * transaction or raw SQL), so nothing that reaches Postgres escapes the count.
 */
export function createCountingDatabase(url: string = testDatabaseUrl()): CountingDatabase {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  let queries = 0;
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
      queries += 1;
      return query(...args);
    };
  });
  return {
    db: drizzle({ client: pool }),
    get queries() {
      return queries;
    },
    reset() {
      queries = 0;
    },
    close: () => pool.end(),
  };
}
