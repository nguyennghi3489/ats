import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { AppConfig } from '../config/config.js';
import { createDatabase } from './database.js';

/**
 * The drizzle-kit migrations folder (`apps/api/drizzle`). Resolved from this file so it is the same
 * from `src/database` (tests) and `dist/database` (scripts, image).
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Applies every migration not yet recorded in `drizzle.__drizzle_migrations`, in order, each in
 * a transaction. Running it again with nothing new is a no-op.
 */
export async function runMigrations(url: string): Promise<void> {
  const database = createDatabase({ url, max: 1 });
  try {
    await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await database.close();
  }
}

/**
 * Development only: drops every table, type and extension (schemas `public` and `drizzle`), then
 * applies all migrations again. Refuses to run when `nodeEnv` is `production`.
 */
export async function resetDatabase(url: string, nodeEnv: AppConfig['nodeEnv']): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production');
  }
  const database = createDatabase({ url, max: 1 });
  try {
    await database.transaction(async (tx) => {
      await tx.execute(sql`drop schema if exists drizzle cascade`);
      await tx.execute(sql`drop schema if exists public cascade`);
      await tx.execute(sql`create schema public`);
    });
  } finally {
    await database.close();
  }
  await runMigrations(url);
}
