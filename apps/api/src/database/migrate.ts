// `pnpm --filter api db:migrate`: applies pending migrations from apps/api/drizzle to DATABASE_URL.
// In the image: `node dist/database/migrate.js` (needs the drizzle folder next to dist).
import { ConfigError } from '../config/config.js';
import { loadDatabaseConfig } from './database-config.js';
import { runMigrations } from './migrations.js';

try {
  const config = loadDatabaseConfig(process.env);
  await runMigrations(config.databaseUrl);
  process.stdout.write('Migrations applied.\n');
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
