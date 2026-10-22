import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CountingDatabase, createCountingDatabase } from '../support/counting-database.js';

/**
 * QA for #102: `resolveAccess`'s "exactly one query" check is only meaningful if the counter
 * really counts every statement Postgres receives, so a second query would be caught.
 */
describe('createCountingDatabase', () => {
  let database: CountingDatabase;

  beforeAll(() => {
    database = createCountingDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('starts at zero after reset and counts each statement', async () => {
    database.reset();
    expect(database.queries).toBe(0);

    await database.db.execute(sql`select 1`);
    expect(database.queries).toBe(1);

    await database.db.execute(sql`select 2`);
    await database.db.execute(sql`select 3`);
    expect(database.queries).toBe(3);

    database.reset();
    expect(database.queries).toBe(0);
  });

  it('counts the statements of a transaction, including BEGIN and COMMIT', async () => {
    database.reset();

    await database.db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      await tx.execute(sql`select 2`);
    });

    expect(database.queries).toBe(4);
  });
});
