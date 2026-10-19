import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/database/database.js';
import { DATABASE, DatabaseModule } from '../../src/database/database.module.js';
import { testDatabaseUrl as testDatabaseUrlFromEnv } from '../support/test-database.js';

const testDatabaseUrl = testDatabaseUrlFromEnv();

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
