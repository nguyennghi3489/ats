import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, AUDIT_METADATA_EXAMPLES, type AuditAction } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditMetadataInvalidError, AuditService } from '../../src/audit/audit.service.js';
import { organization, user } from '../../src/auth/auth.schema.js';
import { type Database } from '../../src/database/database.js';
import { DATABASE } from '../../src/database/database.module.js';
import { startTestApp, type TestApp } from '../support/test-app.js';

type Entry = Parameters<AuditService['record']>[1];

// QA (#104): the writer as features will get it, injected from the booted API, rolling back with
// the caller's change and refusing personal data for every action.
describe('AuditService.record (QA)', () => {
  let testApp: TestApp;
  let audit: AuditService;
  let database: Database;
  let workspaceId: string;
  let actorId: string;

  async function count(): Promise<number> {
    const result = await database.db.execute<{ n: number }>(
      sql`select count(*)::int as n from audit_log`,
    );
    return result.rows[0]?.n ?? -1;
  }

  function entry(action: AuditAction, metadata: unknown): Entry {
    return { workspaceId, actorUserId: actorId, action, targetId: randomUUID(), metadata } as Entry;
  }

  beforeAll(async () => {
    testApp = await startTestApp();
    audit = testApp.app.get(AuditService);
    database = testApp.app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    workspaceId = randomUUID();
    actorId = randomUUID();
    await database.db.insert(user).values({ id: actorId, name: 'Actor', email: 'qa@example.test' });
    await database.db
      .insert(organization)
      .values({ id: workspaceId, name: 'QA Co', slug: workspaceId, codePrefix: 'QA' });
  });

  it('is injectable from the booted API without importing AuditModule', () => {
    expect(audit).toBeInstanceOf(AuditService);
  });

  it('rolls back together with the change it records', async () => {
    const renamed = 'QA Co renamed';
    await expect(
      database.transaction(async (tx) => {
        await tx.execute(sql`update organization set name = ${renamed} where id = ${workspaceId}`);
        await audit.record(tx, entry('member.deactivated', { removedAssignmentCount: 1 }));
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');

    expect(await count()).toBe(0);
    const org = await database.db.execute<{ name: string }>(
      sql`select name from organization where id = ${workspaceId}`,
    );
    expect(org.rows[0]?.name).toBe('QA Co');
  });

  it('commits exactly one row per record call with the change', async () => {
    await database.transaction(async (tx) => {
      await audit.record(tx, entry('cv.attached', AUDIT_METADATA_EXAMPLES['cv.attached']));
    });
    expect(await count()).toBe(1);
  });

  it.each(AUDIT_ACTIONS.flatMap((action) => ['email', 'name'].map((key) => [action, key])))(
    '%s: record refuses the unknown key %s, rolls back the transaction and writes nothing',
    async (action, key) => {
      const metadata = {
        ...AUDIT_METADATA_EXAMPLES[action as AuditAction],
        [key]: 'Trần Thị Lan <lan@example.test>',
      };
      const attempt = database.transaction((tx) =>
        audit.record(tx, entry(action as AuditAction, metadata)),
      );
      await expect(attempt).rejects.toBeInstanceOf(AuditMetadataInvalidError);
      await expect(attempt).rejects.toThrow(new RegExp(`\\b${key}\\b`));
      await expect(attempt).rejects.not.toThrow(/Lan|lan@example/);
      expect(await count()).toBe(0);
    },
  );

  it('refuses metadata that is not an object', async () => {
    for (const metadata of [null, 'lan@example.test', ['x'], 3]) {
      await expect(
        database.transaction((tx) => audit.record(tx, entry('member.reactivated', metadata))),
      ).rejects.toBeInstanceOf(AuditMetadataInvalidError);
    }
    expect(await count()).toBe(0);
  });

  it('rejects a workspace id that does not exist (foreign key)', async () => {
    await expect(
      database.transaction((tx) =>
        audit.record(tx, {
          ...entry('member.reactivated', {}),
          workspaceId: randomUUID(),
        }),
      ),
    ).rejects.toThrow();
    expect(await count()).toBe(0);
  });
});
