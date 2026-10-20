import { randomUUID } from 'node:crypto';
import { workspaceSchema } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const PASSWORD = 'correct-horse-battery-staple';

type OrganizationRow = { id: string; name: string; slug: string; code_prefix: string };
type MemberRow = { organization_id: string; user_id: string; role: string; status: string };

describe('POST /api/workspaces', () => {
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

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers },
      body: JSON.stringify(body),
    });
  }

  /** Signs up, verifies and signs in; returns the session cookie. */
  async function signedIn(email = 'lan@example.test'): Promise<string> {
    const signUp = await post('/api/auth/sign-up/email', {
      name: 'Lan',
      email,
      password: PASSWORD,
    });
    expect(signUp.status).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const signIn = await post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((value) => /session_token=/.test(value));
    expect(cookie, 'session cookie').toBeDefined();
    return cookie?.split(';')[0] ?? '';
  }

  function createWorkspace(cookie: string | undefined, body: unknown, key?: string) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (key !== undefined) headers['idempotency-key'] = key;
    return post('/api/workspaces', body, headers);
  }

  async function organizations(): Promise<OrganizationRow[]> {
    const result = await database.db.execute<OrganizationRow>(
      sql`select id, name, slug, code_prefix from organization order by created_at`,
    );
    return result.rows;
  }

  async function members(): Promise<MemberRow[]> {
    const result = await database.db.execute<MemberRow>(
      sql`select organization_id, user_id, role, status from member order by created_at`,
    );
    return result.rows;
  }

  async function activeWorkspaceIds(): Promise<(string | null)[]> {
    const result = await database.db.execute<{ active_organization_id: string | null }>(
      sql`select active_organization_id from session`,
    );
    return result.rows.map((row) => row.active_organization_id);
  }

  it('creates the workspace with its prefix, makes the creator admin and the workspace active', async () => {
    const cookie = await signedIn();

    const response = await createWorkspace(cookie, { name: '  An Nhiên ' }, randomUUID());

    expect(response.status).toBe(201);
    const workspace = workspaceSchema.parse(await response.json());
    expect(workspace).toEqual({
      id: expect.any(String),
      name: 'An Nhiên',
      codePrefix: 'AN',
      role: 'admin',
    });
    const orgs = await organizations();
    expect(orgs).toEqual([
      expect.objectContaining({ id: workspace.id, name: 'An Nhiên', code_prefix: 'AN' }),
    ]);
    expect(orgs[0]?.slug).toBeTruthy();
    const userId = (await database.db.execute<{ id: string }>(sql`select id from "user"`)).rows[0]
      ?.id;
    expect(await members()).toEqual([
      { organization_id: workspace.id, user_id: userId, role: 'admin', status: 'active' },
    ]);
    expect(await activeWorkspaceIds()).toEqual([workspace.id]);
  });

  it('returns the same workspace for a retry with the same key and creates another for a new key', async () => {
    const cookie = await signedIn();
    const key = randomUUID();

    const first = await createWorkspace(cookie, { name: 'Mây Studio' }, key);
    const retry = await createWorkspace(cookie, { name: 'Mây Studio' }, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const created = workspaceSchema.parse(await first.json());
    expect(workspaceSchema.parse(await retry.json())).toEqual(created);
    expect(await organizations()).toHaveLength(1);
    expect(await members()).toHaveLength(1);

    const other = await createWorkspace(cookie, { name: 'Mây Studio' }, randomUUID());

    expect(other.status).toBe(201);
    const second = workspaceSchema.parse(await other.json());
    expect(second.id).not.toBe(created.id);
    expect(second).toMatchObject({ name: 'Mây Studio', codePrefix: 'MS', role: 'admin' });
    expect(await organizations()).toHaveLength(2);
    expect(await activeWorkspaceIds()).toEqual([second.id]);
  });

  it('creates one workspace when the same key is sent concurrently', async () => {
    const cookie = await signedIn();
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => createWorkspace(cookie, { name: 'Hải Đăng Labs' }, key)),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 201]);
    const ids = await Promise.all(
      responses.map(async (response) => workspaceSchema.parse(await response.json()).id),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await organizations()).toEqual([expect.objectContaining({ code_prefix: 'HDL' })]);
  });

  it('keeps keys per user: the same key from another user creates their own workspace', async () => {
    const key = randomUUID();
    const lan = await signedIn('lan@example.test');
    const minh = await signedIn('minh@example.test');

    const first = workspaceSchema.parse(
      await (await createWorkspace(lan, { name: 'A' }, key)).json(),
    );
    const response = await createWorkspace(minh, { name: 'B' }, key);

    expect(response.status).toBe(201);
    expect(workspaceSchema.parse(await response.json()).id).not.toBe(first.id);
  });

  it('answers 401 UNAUTHENTICATED without a session', async () => {
    const response = await createWorkspace(undefined, { name: 'An Nhiên' }, randomUUID());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await organizations()).toEqual([]);
  });

  it('answers 403 EMAIL_NOT_VERIFIED for a session whose email is no longer verified', async () => {
    const cookie = await signedIn();
    await database.db.execute(sql`update "user" set email_verified = false`);

    const response = await createWorkspace(cookie, { name: 'An Nhiên' }, randomUUID());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(await organizations()).toEqual([]);
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['an 81-character name', { name: 'a'.repeat(81) }],
    ['no name', {}],
    ['a name that is not text', { name: 42 }],
  ])('answers 400 VALIDATION_FAILED for %s', async (_, body) => {
    const cookie = await signedIn();

    const response = await createWorkspace(cookie, body, randomUUID());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await organizations()).toEqual([]);
  });

  it('accepts an 80-character name', async () => {
    const cookie = await signedIn();

    const response = await createWorkspace(cookie, { name: 'a'.repeat(80) }, randomUUID());

    expect(response.status).toBe(201);
  });

  it.each([
    ['missing', undefined],
    ['blank', '  '],
  ])('answers 400 IDEMPOTENCY_KEY_REQUIRED when the key is %s', async (_, key) => {
    const cookie = await signedIn();

    const response = await createWorkspace(cookie, { name: 'An Nhiên' }, key);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(await organizations()).toEqual([]);
  });

  it('answers 400 VALIDATION_FAILED for a key longer than 255 characters', async () => {
    const cookie = await signedIn();

    const response = await createWorkspace(cookie, { name: 'An Nhiên' }, 'k'.repeat(256));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  describe('through the Better Auth organization endpoints', () => {
    it('never changes the prefix on update, while the name can change', async () => {
      const cookie = await signedIn();
      const created = workspaceSchema.parse(
        await (await createWorkspace(cookie, { name: 'An Nhiên' }, randomUUID())).json(),
      );

      const update = await post(
        '/api/auth/organization/update',
        { organizationId: created.id, data: { name: 'Bình Minh', codePrefix: 'ZZ' } },
        { cookie },
      );
      const prefixOnly = await post(
        '/api/auth/organization/update',
        { organizationId: created.id, data: { codePrefix: 'ZZ' } },
        { cookie },
      );

      expect(update.status).toBe(200);
      expect(prefixOnly.status).toBe(400);
      expect(await organizations()).toEqual([
        expect.objectContaining({ name: 'Bình Minh', code_prefix: 'AN' }),
      ]);
    });

    it('refuses to create a workspace outside POST /api/workspaces', async () => {
      const cookie = await signedIn();

      const response = await post(
        '/api/auth/organization/create',
        { name: 'Acme', slug: 'acme', codePrefix: 'ZZ' },
        { cookie },
      );

      expect(response.status).toBe(403);
      expect(await organizations()).toEqual([]);
    });

    it('refuses to delete a workspace', async () => {
      const cookie = await signedIn();
      const created = workspaceSchema.parse(
        await (await createWorkspace(cookie, { name: 'An Nhiên' }, randomUUID())).json(),
      );

      const response = await post(
        '/api/auth/organization/delete',
        { organizationId: created.id },
        { cookie },
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(await organizations()).toHaveLength(1);
    });
  });
});
