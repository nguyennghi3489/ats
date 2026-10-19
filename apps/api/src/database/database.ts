import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** The Drizzle client. Build queries with it; use `transaction(fn)` when several writes belong together. */
export type DatabaseClient = NodePgDatabase;

/** The client handed to `transaction(fn)`: same API as `DatabaseClient`, scoped to one transaction. */
export type Transaction = Parameters<Parameters<DatabaseClient['transaction']>[0]>[0];

export interface DatabaseOptions {
  /** Postgres connection string (`DATABASE_URL`). */
  url: string;
  /** Pool size. Defaults to pg's 10. */
  max?: number;
}

/** A connection pool, its Drizzle client and the helpers every feature uses. */
export interface Database {
  readonly db: DatabaseClient;
  /**
   * Runs `fn` in one transaction: commits when it resolves, rolls back and rethrows when it throws.
   * Use the `tx` argument (not `db`) for every query that must be part of the transaction.
   */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** `true` when Postgres answers a trivial query. Never throws. */
  isReachable(): Promise<boolean>;
  /** Closes every pooled connection. */
  close(): Promise<void>;
}

const logger = new Logger('Database');

export function createDatabase(options: DatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.max,
    // Fail fast instead of queueing forever when Postgres is down; /health relies on it.
    connectionTimeoutMillis: 5_000,
  });
  // An idle connection dropped by the server (restart, network) emits here; without a listener
  // Node would crash the process. The next query opens a fresh connection.
  pool.on('error', (error) => {
    logger.warn(`idle connection lost: ${error.message}`);
  });

  const db = drizzle({ client: pool });
  let closed: Promise<void> | undefined;

  return {
    db,
    transaction: (fn) => db.transaction(fn),
    async isReachable() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close() {
      closed ??= pool.end();
      return closed;
    },
  };
}
