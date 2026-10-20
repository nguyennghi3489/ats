import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveAccess } from '../../src/access/resolve-access.js';
import { type CountingDatabase, createCountingDatabase } from '../support/counting-database.js';
import { accessFixtures } from './fixtures.js';

describe('resolveAccess', () => {
  let database: CountingDatabase;
  let fixtures: ReturnType<typeof accessFixtures>;

  beforeAll(() => {
    database = createCountingDatabase();
    fixtures = accessFixtures(database.db);
  });

  beforeEach(() => {
    database.reset();
  });

  afterAll(async () => {
    await database.close();
  });

  /** Runs `resolveAccess` and checks it sent exactly one statement to Postgres. */
  async function resolve(token: string, workspaceId: string | null = null) {
    database.reset();
    const result = await resolveAccess(database.db, token, workspaceId);
    expect(database.queries, 'statements sent by resolveAccess').toBe(1);
    return result;
  }

  it('returns the user, workspace and role of an active member of the active workspace', async () => {
    const lan = await fixtures.user('lan@example.test');
    const workspaceId = await fixtures.workspace();
    await fixtures.member(workspaceId, lan.id, 'recruiter');
    const token = await fixtures.session(lan.id, { activeWorkspaceId: workspaceId });

    expect(await resolve(token)).toEqual({
      ok: true,
      actor: {
        user: {
          id: lan.id,
          name: 'Lan Test',
          email: 'lan@example.test',
          locale: 'vi',
          emailVerified: true,
        },
        sessionToken: token,
        workspaceId,
        role: 'recruiter',
      },
    });
  });

  it('is UNAUTHENTICATED for an unknown token', async () => {
    expect(await resolve('no-such-token')).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('is UNAUTHENTICATED for an expired session', async () => {
    const lan = await fixtures.user();
    const token = await fixtures.session(lan.id, { expiresAt: new Date(Date.now() - 1000) });

    expect(await resolve(token)).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('is WORKSPACE_REQUIRED, with the session actor, when the session has no active workspace', async () => {
    const lan = await fixtures.user();
    const token = await fixtures.session(lan.id);

    const result = await resolve(token);

    expect(result).toEqual({
      ok: false,
      code: 'WORKSPACE_REQUIRED',
      actor: {
        user: expect.objectContaining({ id: lan.id }),
        sessionToken: token,
        workspaceId: null,
      },
    });
  });

  it('is WORKSPACE_ACCESS_REVOKED when the membership is deactivated', async () => {
    const lan = await fixtures.user();
    const workspaceId = await fixtures.workspace();
    await fixtures.member(workspaceId, lan.id, 'admin', 'deactivated');
    const token = await fixtures.session(lan.id, { activeWorkspaceId: workspaceId });

    expect(await resolve(token)).toMatchObject({
      ok: false,
      code: 'WORKSPACE_ACCESS_REVOKED',
      actor: { user: { id: lan.id }, workspaceId: null },
    });
  });

  it('is WORKSPACE_ACCESS_REVOKED when the user is not a member of the active workspace', async () => {
    const lan = await fixtures.user();
    const workspaceId = await fixtures.workspace();
    const token = await fixtures.session(lan.id, { activeWorkspaceId: workspaceId });

    expect(await resolve(token)).toMatchObject({ ok: false, code: 'WORKSPACE_ACCESS_REVOKED' });
  });

  it('checks the workspace passed in instead of the active one', async () => {
    const lan = await fixtures.user();
    const active = await fixtures.workspace('Active');
    const other = await fixtures.workspace('Other');
    await fixtures.member(active, lan.id, 'admin');
    await fixtures.member(other, lan.id, 'collaborator');
    const token = await fixtures.session(lan.id, { activeWorkspaceId: active });

    expect(await resolve(token, other)).toMatchObject({
      ok: true,
      actor: { workspaceId: other, role: 'collaborator' },
    });
    expect(await resolve(token, randomUUID())).toMatchObject({
      ok: false,
      code: 'WORKSPACE_ACCESS_REVOKED',
    });
  });

  it('reads the membership fresh on every call (no cache)', async () => {
    const lan = await fixtures.user();
    const workspaceId = await fixtures.workspace();
    await fixtures.member(workspaceId, lan.id, 'recruiter');
    const token = await fixtures.session(lan.id, { activeWorkspaceId: workspaceId });
    expect(await resolve(token)).toMatchObject({ ok: true, actor: { role: 'recruiter' } });

    await database.db.execute(sql`update member set role = 'admin'`);
    expect(await resolve(token)).toMatchObject({ ok: true, actor: { role: 'admin' } });

    await database.db.execute(sql`update member set status = 'deactivated'`);
    expect(await resolve(token)).toMatchObject({ ok: false, code: 'WORKSPACE_ACCESS_REVOKED' });
  });
});
