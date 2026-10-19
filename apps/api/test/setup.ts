import { afterAll, beforeEach } from 'vitest';
import { createDatabase } from '../src/database/database.js';
import { testDatabaseUrl, truncateAllTables } from './support/test-database.js';

// Every integration test starts with empty tables. Files run one at a time (see the config),
// so no other file is using the tables while they are truncated.
const database = createDatabase({ url: testDatabaseUrl(), max: 1 });

beforeEach(async () => {
  await truncateAllTables(database);
});

afterAll(async () => {
  await database.close();
});
