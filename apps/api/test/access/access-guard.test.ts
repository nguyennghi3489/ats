import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Actor } from '../../src/access/decorators.js';
import type { WorkspaceActor } from '../../src/access/resolve-access.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const PASSWORD = 'correct-horse-battery-staple';

/** A route with no access decorator: it gets the default rule (session + active membership). */
@Controller('test/access-probe')
class AccessProbeController {
  @Get()
  probe(@Actor() actor: WorkspaceActor) {
    return { workspaceId: actor.workspaceId, role: actor.role, userId: actor.user.id };
  }
}

describe('global access guard', () => {
  let api: TestApp;
  let database: Database;

  beforeAll(async () => {
    api = await startTestApp({}, { controllers: [AccessProbeController] });
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
  });

  afterAll(async () => {
    await api.close();
    await database.close();
  });

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers },
      body: JSON.stringify(body),
    });
  }

  function get(path: string, cookie?: string) {
    return api.request(path, { headers: cookie ? { cookie } : {} });
  }

  /** Signs up, verifies and signs in through Better Auth; returns the signed session cookie. */
  async function signedIn(email = 'lan@example.test'): Promise<string> {
    expect(
      (await post('/api/auth/sign-up/email', { name: 'Lan', email, password: PASSWORD })).status,
    ).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const signIn = await post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((value) => /session_token=/.test(value));
    expect(cookie, 'session cookie').toBeDefined();
    return cookie?.split(';')[0] ?? '';
  }

  async function createWorkspace(cookie: string, name = 'Mây Studio') {
    const response = await post(
      '/api/workspaces',
      { name },
      { cookie, 'idempotency-key': randomUUID() },
    );
    return response;
  }

  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
  }

  describe('on a route without decorators', () => {
    it('answers 401 UNAUTHENTICATED without a session', async () => {
      await expectError(await get('/test/access-probe'), 401, 'UNAUTHENTICATED');
    });

    it('answers 401 UNAUTHENTICATED with a forged or unknown session cookie', async () => {
      const cookie = await signedIn();
      const name = cookie.split('=')[0] ?? '';

      await expectError(
        await get('/test/access-probe', `${name}=forged.value`),
        401,
        'UNAUTHENTICATED',
      );
      await database.db.execute(sql`delete from "session"`);
      await expectError(await get('/test/access-probe', cookie), 401, 'UNAUTHENTICATED');
    });

    it('answers 401 UNAUTHENTICATED once the session has expired', async () => {
      const cookie = await signedIn();
      await database.db.execute(sql`update "session" set expires_at = now() - interval '1 minute'`);

      await expectError(await get('/test/access-probe', cookie), 401, 'UNAUTHENTICATED');
    });

    it('answers 403 WORKSPACE_REQUIRED with a session but no active workspace', async () => {
      const cookie = await signedIn();

      await expectError(await get('/test/access-probe', cookie), 403, 'WORKSPACE_REQUIRED');
    });

    it('answers 200 with the workspace and role for an active member', async () => {
      const cookie = await signedIn();
      const workspace = (await (await createWorkspace(cookie)).json()) as { id: string };

      const response = await get('/test/access-probe', cookie);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        workspaceId: workspace.id,
        role: 'admin',
        userId: expect.any(String),
      });
    });

    it('answers 403 WORKSPACE_ACCESS_REVOKED on the very next request after deactivation', async () => {
      const cookie = await signedIn();
      expect((await createWorkspace(cookie)).status).toBe(201);
      expect((await get('/test/access-probe', cookie)).status).toBe(200);

      await database.db.execute(sql`update member set status = 'deactivated'`);

      await expectError(await get('/test/access-probe', cookie), 403, 'WORKSPACE_ACCESS_REVOKED');
    });

    it('answers 403 WORKSPACE_ACCESS_REVOKED when the membership row is gone', async () => {
      const cookie = await signedIn();
      expect((await createWorkspace(cookie)).status).toBe(201);

      await database.db.execute(sql`delete from member`);

      await expectError(await get('/test/access-probe', cookie), 403, 'WORKSPACE_ACCESS_REVOKED');
    });

    it('reflects a role change on the next request', async () => {
      const cookie = await signedIn();
      expect((await createWorkspace(cookie)).status).toBe(201);
      expect(await (await get('/test/access-probe', cookie)).json()).toMatchObject({
        role: 'admin',
      });

      await database.db.execute(sql`update member set role = 'collaborator'`);

      expect(await (await get('/test/access-probe', cookie)).json()).toMatchObject({
        role: 'collaborator',
      });
    });
  });

  describe('opted-out routes', () => {
    it('serves GET /health without a session (@Public)', async () => {
      const response = await get('/health');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', db: 'ok' });
    });

    it('serves GET /api/me with a session and no active workspace (@SessionOnly)', async () => {
      const cookie = await signedIn('mai@example.test');

      const response = await get('/api/me', cookie);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        user: { email: 'mai@example.test', name: 'Lan', emailVerified: true },
      });
    });

    it('serves POST /api/workspaces with a session and no active workspace (@SessionOnly)', async () => {
      const cookie = await signedIn();

      const response = await createWorkspace(cookie);

      expect(response.status).toBe(201);
    });

    it('serves GET /api/workspaces with a session and no active workspace (@SessionOnly)', async () => {
      const cookie = await signedIn();

      const response = await get('/api/workspaces', cookie);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ workspaces: [], activeWorkspaceId: null });
    });

    it('serves PUT /api/workspaces/active after the active workspace is revoked (@SessionOnly)', async () => {
      const cookie = await signedIn();
      const first = (await (await createWorkspace(cookie, 'First')).json()) as { id: string };
      const second = (await (await createWorkspace(cookie, 'Second')).json()) as { id: string };
      await database.db.execute(
        sql`update member set status = 'deactivated' where organization_id = ${second.id}`,
      );
      await expectError(await get('/test/access-probe', cookie), 403, 'WORKSPACE_ACCESS_REVOKED');

      const listed = await get('/api/workspaces', cookie);
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject({ activeWorkspaceId: null });
      const switched = await api.request('/api/workspaces/active', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, cookie },
        body: JSON.stringify({ workspaceId: first.id }),
      });
      expect(switched.status).toBe(200);
      expect(await (await get('/test/access-probe', cookie)).json()).toMatchObject({
        workspaceId: first.id,
      });
    });

    it('keeps serving session-only routes after the workspace access is revoked', async () => {
      const cookie = await signedIn();
      expect((await createWorkspace(cookie)).status).toBe(201);
      await database.db.execute(sql`update member set status = 'deactivated'`);

      expect((await get('/api/me', cookie)).status).toBe(200);
      expect((await createWorkspace(cookie, 'Second')).status).toBe(201);
      expect((await get('/test/access-probe', cookie)).status).toBe(200);
    });

    it('still requires a session on session-only routes', async () => {
      await expectError(await get('/api/me'), 401, 'UNAUTHENTICATED');
      await expectError(
        await post('/api/workspaces', { name: 'X' }, { 'idempotency-key': randomUUID() }),
        401,
        'UNAUTHENTICATED',
      );
      await expectError(await get('/api/workspaces'), 401, 'UNAUTHENTICATED');
    });
  });
});
