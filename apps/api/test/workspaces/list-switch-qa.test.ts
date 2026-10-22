import { randomUUID } from 'node:crypto';
import { workspaceListSchema, workspaceSchema, type WorkspaceRole } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const PASSWORD = 'correct-horse-battery-staple';

// QA for #101: edges of GET /api/workspaces and PUT /api/workspaces/active beyond the
// acceptance-criteria tests in list-switch.test.ts.
describe('QA: GET /api/workspaces and PUT /api/workspaces/active', () => {
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

  function send(method: string, path: string, cookie?: string, body?: string) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
    };
    if (cookie) headers.cookie = cookie;
    return api.request(path, { method, headers, body });
  }

  async function signUp(email: string): Promise<string> {
    const response = await send(
      'POST',
      '/api/auth/sign-up/email',
      undefined,
      JSON.stringify({ name: 'QA', email, password: PASSWORD }),
    );
    expect(response.status).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const user = await database.db.execute<{ id: string }>(
      sql`select id from "user" where email = ${email}`,
    );
    return user.rows[0]?.id ?? '';
  }

  /** A fresh session (sign-in) for an existing user; returns its cookie. */
  async function signIn(email: string): Promise<string> {
    const response = await send(
      'POST',
      '/api/auth/sign-in/email',
      undefined,
      JSON.stringify({ email, password: PASSWORD }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((value) => /session_token=/.test(value));
    expect(cookie, 'session cookie').toBeDefined();
    return cookie?.split(';')[0] ?? '';
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

  async function addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
    await database.db.execute(
      sql`insert into member (id, organization_id, user_id, role, status)
          values (${randomUUID()}, ${workspaceId}, ${userId}, ${role}, 'active')`,
    );
  }

  async function list(cookie: string) {
    const response = await send('GET', '/api/workspaces', cookie);
    expect(response.status).toBe(200);
    return workspaceListSchema.parse(await response.json());
  }

  function switchTo(cookie: string | undefined, workspaceId: string) {
    return send('PUT', '/api/workspaces/active', cookie, JSON.stringify({ workspaceId }));
  }

  it('switching changes only the calling session, not the user’s other sessions', async () => {
    await signUp('qa-minh@example.test');
    const lanId = await signUp('qa-lan@example.test');
    const minh = await signIn('qa-minh@example.test');
    const laptop = await signIn('qa-lan@example.test');
    const shared = await createWorkspace(minh, 'Hải Đăng Labs');
    await addMember(shared.id, lanId, 'recruiter');
    const own = await createWorkspace(laptop, 'Mây Studio');
    const phone = await signIn('qa-lan@example.test');
    await switchTo(phone, own.id);

    expect((await switchTo(phone, shared.id)).status).toBe(200);

    expect((await list(phone)).activeWorkspaceId).toBe(shared.id);
    expect((await list(laptop)).activeWorkspaceId).toBe(own.id);
  });

  it('a reactivated membership is listed again and can be switched to', async () => {
    await signUp('qa-minh@example.test');
    const minh = await signIn('qa-minh@example.test');
    const lanId = await signUp('qa-lan@example.test');
    const lan = await signIn('qa-lan@example.test');
    const shared = await createWorkspace(minh, 'Hải Đăng Labs');
    await addMember(shared.id, lanId, 'collaborator');
    await database.db.execute(
      sql`update member set status = 'deactivated' where organization_id = ${shared.id} and user_id = ${lanId}`,
    );
    expect((await switchTo(lan, shared.id)).status).toBe(404);
    expect((await list(lan)).workspaces).toEqual([]);

    await database.db.execute(
      sql`update member set status = 'active' where organization_id = ${shared.id} and user_id = ${lanId}`,
    );

    expect((await list(lan)).workspaces.map((workspace) => workspace.id)).toEqual([shared.id]);
    expect((await switchTo(lan, shared.id)).status).toBe(200);
    expect((await list(lan)).activeWorkspaceId).toBe(shared.id);
  });

  it('reports the active workspace as null once the membership row is removed', async () => {
    await signUp('qa-minh@example.test');
    const minh = await signIn('qa-minh@example.test');
    const lanId = await signUp('qa-lan@example.test');
    const lan = await signIn('qa-lan@example.test');
    const shared = await createWorkspace(minh, 'Hải Đăng Labs');
    await addMember(shared.id, lanId, 'recruiter');
    expect((await switchTo(lan, shared.id)).status).toBe(200);

    await database.db.execute(
      sql`delete from member where organization_id = ${shared.id} and user_id = ${lanId}`,
    );

    expect(await list(lan)).toEqual({ activeWorkspaceId: null, workspaces: [] });
  });

  it('a refused switch leaves the session’s active workspace unchanged', async () => {
    await signUp('qa-minh@example.test');
    const minh = await signIn('qa-minh@example.test');
    await signUp('qa-lan@example.test');
    const lan = await signIn('qa-lan@example.test');
    const own = await createWorkspace(lan, 'Mây Studio');
    const others = await createWorkspace(minh, 'Hải Đăng Labs');

    const response = await switchTo(lan, others.id);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: 'WORKSPACE_UNAVAILABLE',
      message: expect.any(String),
    });
    expect((await list(lan)).activeWorkspaceId).toBe(own.id);
    expect((await list(minh)).activeWorkspaceId).toBe(others.id);
  });

  it('a malformed JSON body on the switch is refused with 400, not a server error', async () => {
    await signUp('qa-lan@example.test');
    const lan = await signIn('qa-lan@example.test');

    const response = await send('PUT', '/api/workspaces/active', lan, '{"workspaceId":');

    expect(response.status).toBe(400);
  });

  it('answers the switch with 401 for a forged cookie before looking at the body', async () => {
    for (const body of [JSON.stringify({ workspaceId: randomUUID() }), '{}']) {
      const response = await send(
        'PUT',
        '/api/workspaces/active',
        'better-auth.session_token=forged',
        body,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('answers 401 after sign-out with the old cookie', async () => {
    await signUp('qa-lan@example.test');
    const lan = await signIn('qa-lan@example.test');
    const own = await createWorkspace(lan, 'Mây Studio');
    const signOut = await send('POST', '/api/auth/sign-out', lan, '{}');
    expect(signOut.status).toBe(200);

    expect((await send('GET', '/api/workspaces', lan)).status).toBe(401);
    expect((await switchTo(lan, own.id)).status).toBe(401);
  });
});
