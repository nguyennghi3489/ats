// `pnpm --filter api db:reset` (development only): drops everything in DATABASE_URL, then migrates.
import { ConfigError } from '../config/config.js';
import { loadDatabaseConfig } from './database-config.js';
import { resetDatabase } from './migrations.js';

try {
  const config = loadDatabaseConfig(process.env);
  await resetDatabase(config.databaseUrl, config.nodeEnv);
  process.stdout.write('Database reset and migrations applied.\n');
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
