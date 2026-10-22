import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, AUDIT_METADATA_EXAMPLES } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditMetadataInvalidError, AuditService } from '../../src/audit/audit.service.js';
import { organization, user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { testDatabaseUrl } from '../support/test-database.js';

type AuditRow = {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: unknown;
  created_at: string;
};

// The audit writer against the Compose test Postgres: entries live and die with the caller's
// transaction, and metadata that is not allowed for the action never reaches the table.
describe('AuditService.record', () => {
  let database: Database;
  const audit = new AuditService();
  let workspaceId: string;
  let actorId: string;

  async function rows(): Promise<AuditRow[]> {
    const result = await database.db.execute<AuditRow>(
      sql`select * from audit_log order by created_at`,
    );
    return result.rows;
  }

  beforeAll(() => {
    database = createDatabase({ url: testDatabaseUrl(), max: 2 });
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    workspaceId = randomUUID();
    actorId = randomUUID();
    await database.db.insert(user).values({ id: actorId, name: 'Actor', email: 'a@example.test' });
    await database.db
      .insert(organization)
      .values({ id: workspaceId, name: 'Acme', slug: workspaceId, codePrefix: 'AC' });
  });

  it('writes exactly one row when the transaction commits', async () => {
    const targetId = randomUUID();
    await database.transaction((tx) =>
      audit.record(tx, {
        workspaceId,
        actorUserId: actorId,
        action: 'member.role_changed',
        targetId,
        metadata: { fromRole: 'recruiter', toRole: 'admin' },
      }),
    );

    const written = await rows();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      workspace_id: workspaceId,
      actor_user_id: actorId,
      action: 'member.role_changed',
      target_type: 'member',
      target_id: targetId,
      metadata: { fromRole: 'recruiter', toRole: 'admin' },
    });
    expect(written[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(written[0]?.created_at ?? ''))).toBe(false);
  });

  it('leaves no row when the transaction rolls back', async () => {
    await expect(
      database.transaction(async (tx) => {
        await audit.record(tx, {
          workspaceId,
          actorUserId: actorId,
          action: 'job.scope_changed',
          targetId: randomUUID(),
          metadata: { fromScope: 'normal', toScope: 'restricted' },
        });
        throw new Error('change failed');
      }),
    ).rejects.toThrow('change failed');

    expect(await rows()).toHaveLength(0);
  });

  it('accepts an entry without an actor (system action)', async () => {
    await database.transaction((tx) =>
      audit.record(tx, {
        workspaceId,
        actorUserId: null,
        action: 'cv.claude_extraction',
        targetId: randomUUID(),
        metadata: AUDIT_METADATA_EXAMPLES['cv.claude_extraction'],
      }),
    );

    expect((await rows())[0]).toMatchObject({ actor_user_id: null, target_type: 'cv_upload' });
  });

  it.each(AUDIT_ACTIONS)('stores the documented metadata of %s', async (action) => {
    await database.transaction((tx) =>
      audit.record(tx, {
        workspaceId,
        actorUserId: actorId,
        action,
        targetId: randomUUID(),
        metadata: AUDIT_METADATA_EXAMPLES[action],
      } as Parameters<AuditService['record']>[1]),
    );

    expect((await rows())[0]?.metadata).toEqual(AUDIT_METADATA_EXAMPLES[action]);
  });

  it('throws on metadata the action does not allow, without its values, and writes nothing', async () => {
    const attempt = database.transaction((tx) =>
      audit.record(tx, {
        workspaceId,
        actorUserId: actorId,
        action: 'candidate.erased',
        targetId: randomUUID(),
        metadata: {
          applicationCount: 1,
          deletedFileCount: 2,
          email: 'lan@example.test',
        } as never,
      }),
    );

    await expect(attempt).rejects.toBeInstanceOf(AuditMetadataInvalidError);
    await expect(attempt).rejects.not.toThrow(/lan@example\.test/);
    expect(await rows()).toHaveLength(0);
  });

  it('nulls the actor instead of losing the entry when the user row is deleted', async () => {
    await database.transaction((tx) =>
      audit.record(tx, {
        workspaceId,
        actorUserId: actorId,
        action: 'member.reactivated',
        targetId: randomUUID(),
        metadata: {},
      }),
    );
    await database.db.execute(sql`delete from "user" where id = ${actorId}`);

    const written = await rows();
    expect(written).toHaveLength(1);
    expect(written[0]?.actor_user_id).toBeNull();
  });

  it('rejects an action the table does not know', async () => {
    await expect(
      database.db.execute(
        sql`insert into audit_log (workspace_id, action, target_type, target_id, metadata)
            values (${workspaceId}, 'member.deleted', 'member', 'x', '{}'::jsonb)`,
      ),
    ).rejects.toThrow();
  });

  it('indexes entries by workspace and time', async () => {
    const result = await database.db.execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where tablename = 'audit_log'`,
    );
    expect(result.rows.map((row) => row.indexdef)).toContainEqual(
      expect.stringMatching(/\(workspace_id, created_at\)/),
    );
  });
});
