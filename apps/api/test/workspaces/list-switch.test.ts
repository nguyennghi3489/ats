import { randomUUID } from 'node:crypto';
import { workspaceListSchema, workspaceSchema, type WorkspaceRole } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const PASSWORD = 'correct-horse-battery-staple';

describe('GET /api/workspaces and PUT /api/workspaces/active', () => {
  let api: TestApp;
  let database: Database;

  beforeAll(async () => {
    api = await startTestApp();
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
  });

  afterAll(async () => {
    await api.close();
    await database.close();
  });

  function send(method: string, path: string, cookie?: string, body?: unknown) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
    };
    if (cookie) headers.cookie = cookie;
    return api.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Signs up, verifies and signs in; returns the session cookie and the user id. */
  async function signedIn(email: string): Promise<{ cookie: string; userId: string }> {
    const signUp = await send('POST', '/api/auth/sign-up/email', undefined, {
      name: 'Lan',
      email,
      password: PASSWORD,
    });
    expect(signUp.status).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const signIn = await send('POST', '/api/auth/sign-in/email', undefined, {
      email,
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((value) => /session_token=/.test(value));
    expect(cookie, 'session cookie').toBeDefined();
    const user = await database.db.execute<{ id: string }>(
      sql`select id from "user" where email = ${email}`,
    );
    return { cookie: cookie?.split(';')[0] ?? '', userId: user.rows[0]?.id ?? '' };
  }

  async function createWorkspace(cookie: string, name: string) {
    const response = await api.request('/api/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_WEB_ORIGIN,
        cookie,
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ name }),
    });
    expect(response.status).toBe(201);
    return workspaceSchema.parse(await response.json());
  }

  async function addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    status: 'active' | 'deactivated' = 'active',
  ) {
    await database.db.execute(
      sql`insert into member (id, organization_id, user_id, role, status)
          values (${randomUUID()}, ${workspaceId}, ${userId}, ${role}, ${status})`,
    );
  }

  async function setStatus(workspaceId: string, userId: string, status: string) {
    await database.db.execute(
      sql`update member set status = ${status}
          where organization_id = ${workspaceId} and user_id = ${userId}`,
    );
  }

  async function list(cookie: string) {
    const response = await send('GET', '/api/workspaces', cookie);
    expect(response.status).toBe(200);
    return workspaceListSchema.parse(await response.json());
  }

  function switchTo(cookie: string | undefined, body: unknown) {
    return send('PUT', '/api/workspaces/active', cookie, body);
  }

  it('lists every workspace of a member of two, sorted by name, with their role and the active one', async () => {
    const minh = await signedIn('minh@example.test');
    const lan = await signedIn('lan@example.test');
    const zeta = await createWorkspace(minh.cookie, 'zeta Studio');
    await addMember(zeta.id, lan.userId, 'recruiter');
    const own = await createWorkspace(lan.cookie, 'Ánh Dương');

    const result = await list(lan.cookie);

    expect(result).toEqual({
      activeWorkspaceId: own.id,
      workspaces: [
        { id: own.id, name: 'Ánh Dương', codePrefix: 'AD', role: 'admin' },
        { id: zeta.id, name: 'zeta Studio', codePrefix: 'ZS', role: 'recruiter' },
      ],
    });
  });

  it('sorts names with Vietnamese collation, ignoring case', async () => {
    const lan = await signedIn('lan@example.test');
    for (const name of ['Đông Á', 'beta', 'Dương', 'Ăn Ngon', 'An Nhiên', 'Bình']) {
      await createWorkspace(lan.cookie, name);
    }

    const { workspaces } = await list(lan.cookie);

    expect(workspaces.map((workspace) => workspace.name)).toEqual([
      'An Nhiên',
      'Ăn Ngon',
      'beta',
      'Bình',
      'Dương',
      'Đông Á',
    ]);
  });

  it('returns an empty list and no active workspace for a user without workspaces', async () => {
    const lan = await signedIn('lan@example.test');

    expect(await list(lan.cookie)).toEqual({ activeWorkspaceId: null, workspaces: [] });
  });

  it('hides a deactivated membership and reports an active workspace pointing at it as null', async () => {
    const minh = await signedIn('minh@example.test');
    const lan = await signedIn('lan@example.test');
    const shared = await createWorkspace(minh.cookie, 'Hải Đăng Labs');
    await addMember(shared.id, lan.userId, 'collaborator');
    const own = await createWorkspace(lan.cookie, 'Mây Studio');
    expect((await switchTo(lan.cookie, { workspaceId: shared.id })).status).toBe(200);

    await setStatus(shared.id, lan.userId, 'deactivated');
    const result = await list(lan.cookie);

    expect(result).toEqual({
      activeWorkspaceId: null,
      workspaces: [{ id: own.id, name: 'Mây Studio', codePrefix: 'MS', role: 'admin' }],
    });
  });

  it('switches to a workspace the user belongs to and lists it as active afterwards', async () => {
    const minh = await signedIn('minh@example.test');
    const lan = await signedIn('lan@example.test');
    const shared = await createWorkspace(minh.cookie, 'Hải Đăng Labs');
    await addMember(shared.id, lan.userId, 'recruiter');
    const own = await createWorkspace(lan.cookie, 'Mây Studio');
    expect((await list(lan.cookie)).activeWorkspaceId).toBe(own.id);

    const response = await switchTo(lan.cookie, { workspaceId: shared.id });

    expect(response.status).toBe(200);
    expect(workspaceSchema.parse(await response.json())).toEqual({
      id: shared.id,
      name: 'Hải Đăng Labs',
      codePrefix: 'HDL',
      role: 'recruiter',
    });
    expect((await list(lan.cookie)).activeWorkspaceId).toBe(shared.id);

    const back = await switchTo(lan.cookie, { workspaceId: own.id });
    expect(back.status).toBe(200);
    expect((await list(lan.cookie)).activeWorkspaceId).toBe(own.id);
  });

  it('answers an unknown id, another user’s workspace and a deactivated membership with the same 404', async () => {
    const minh = await signedIn('minh@example.test');
    const lan = await signedIn('lan@example.test');
    const own = await createWorkspace(lan.cookie, 'Mây Studio');
    const others = await createWorkspace(minh.cookie, 'Hải Đăng Labs');
    const left = await createWorkspace(minh.cookie, 'Ánh Dương');
    await addMember(left.id, lan.userId, 'recruiter', 'deactivated');

    const responses = await Promise.all(
      [randomUUID(), others.id, left.id].map((workspaceId) =>
        switchTo(lan.cookie, { workspaceId }),
      ),
    );

    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(JSON.parse(bodies[0] ?? '')).toEqual({
      code: 'WORKSPACE_UNAVAILABLE',
      message: expect.any(String),
    });
    expect(new Set(bodies).size).toBe(1);
    expect((await list(lan.cookie)).activeWorkspaceId).toBe(own.id);
  });

  it('refuses a body without a workspace id with 400 VALIDATION_FAILED', async () => {
    const lan = await signedIn('lan@example.test');

    for (const body of [{}, { workspaceId: '' }, { workspaceId: 42 }]) {
      const response = await switchTo(lan.cookie, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('answers both endpoints with 401 UNAUTHENTICATED without a session', async () => {
    const lan = await signedIn('lan@example.test');
    const own = await createWorkspace(lan.cookie, 'Mây Studio');

    for (const response of [
      await send('GET', '/api/workspaces'),
      await switchTo(undefined, { workspaceId: own.id }),
      await send('GET', '/api/workspaces', 'better-auth.session_token=forged'),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });
});
