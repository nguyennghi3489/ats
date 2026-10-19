import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Database } from './database.js';
import { DATABASE, DatabaseModule } from './database.module.js';

// Integration test against the Compose Postgres test database.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://ats:ats@127.0.0.1:5432/ats_test';

describe('DatabaseModule', () => {
  it('provides one connected Database and closes it when the application shuts down', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot({ url: testDatabaseUrl })],
    }).compile();
    await moduleRef.init();
    const database = moduleRef.get<Database>(DATABASE);

    expect(await database.isReachable()).toBe(true);

    await moduleRef.close();

    expect(await database.isReachable()).toBe(false);
  });
});
