import { resetDatabase } from '../src/database/migrations.js';
import { testDatabaseUrl } from './support/test-database.js';

/**
 * Runs once before the integration suite: drops everything in the test database, then applies
 * every Drizzle migration, so each run starts from a fresh schema whatever the last one left.
 */
export default async function setup(): Promise<void> {
  await resetDatabase(testDatabaseUrl(), 'test');
}
