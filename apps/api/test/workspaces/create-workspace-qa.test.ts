import { randomUUID } from 'node:crypto';
import { workspaceSchema } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

// QA checks for #100 beyond the developer suite: retry semantics, error precedence and the fixed
// prefix as seen through Better Auth's own organization read endpoints.

const PASSWORD = 'correct-horse-battery-staple';

describe('POST /api/workspaces (QA)', () => {
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

  function send(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return api.request(path, {
      method,
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function signedIn(email: string): Promise<string> {
    expect(
      (await send('POST', '/api/auth/sign-up/email', { name: 'QA', email, password: PASSWORD }))
        .status,
    ).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const signIn = await send('POST', '/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((value) => /session_token=/.test(value));
    return cookie?.split(';')[0] ?? '';
  }

  function create(cookie: string | undefined, body: unknown, key?: string) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (key !== undefined) headers['idempotency-key'] = key;
    return send('POST', '/api/workspaces', body, headers);
  }

  async function organizationCount(): Promise<number> {
    const result = await database.db.execute<{ n: string }>(
      sql`select count(*) as n from organization`,
    );
    return Number(result.rows[0]?.n);
  }

  it('a retry with the same key but another name returns the first workspace unchanged', async () => {
    const cookie = await signedIn('qa-retry@example.test');
    const key = randomUUID();

    const first = await create(cookie, { name: 'An Nhiên' }, key);
    const retry = await create(cookie, { name: 'Something Else' }, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const created = workspaceSchema.parse(await first.json());
    expect(workspaceSchema.parse(await retry.json())).toEqual(created);
    expect(created).toMatchObject({ name: 'An Nhiên', codePrefix: 'AN', role: 'admin' });
    expect(await organizationCount()).toBe(1);
  });

  it('answers 401 UNAUTHENTICATED before checking the key or the body', async () => {
    const response = await create(undefined, { name: '' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers 401 UNAUTHENTICATED for a forged session cookie', async () => {
    const response = await create(
      'better-auth.session_token=forged.value',
      { name: 'An Nhiên' },
      randomUUID(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await organizationCount()).toBe(0);
  });

  it('Better Auth reads the new workspace as active, with its fixed prefix, after a rename', async () => {
    const cookie = await signedIn('qa-full@example.test');
    const created = workspaceSchema.parse(
      await (await create(cookie, { name: 'Hải Đăng Labs' }, randomUUID())).json(),
    );

    const rename = await send(
      'POST',
      '/api/auth/organization/update',
      { organizationId: created.id, data: { name: 'Đông Á', codePrefix: 'DA' } },
      { cookie },
    );
    const full = await send('GET', '/api/auth/organization/get-full-organization', undefined, {
      cookie,
    });

    expect(rename.status).toBe(200);
    expect(full.status).toBe(200);
    const body = (await full.json()) as {
      id: string;
      name: string;
      codePrefix: string;
      members: { role: string; status: string }[];
    };
    expect(body).toMatchObject({ id: created.id, name: 'Đông Á', codePrefix: 'HDL' });
    expect(body.members).toEqual([expect.objectContaining({ role: 'admin', status: 'active' })]);
  });

  it('a session whose key matches another user keeps its own active workspace', async () => {
    const key = randomUUID();
    const lan = await signedIn('qa-lan@example.test');
    const minh = await signedIn('qa-minh@example.test');

    const lanWorkspace = workspaceSchema.parse(
      await (await create(lan, { name: 'Lan Co' }, key)).json(),
    );
    const minhWorkspace = workspaceSchema.parse(
      await (await create(minh, { name: 'Minh Co' }, key)).json(),
    );

    const rows = await database.db.execute<{ email: string; active: string | null }>(
      sql`select u.email, s.active_organization_id as active from session s join "user" u on u.id = s.user_id order by u.email`,
    );
    expect(rows.rows).toEqual([
      { email: 'qa-lan@example.test', active: lanWorkspace.id },
      { email: 'qa-minh@example.test', active: minhWorkspace.id },
    ]);
  });

  it.each([
    ['snake_case code_prefix', { name: 'Bình Minh', code_prefix: 'ZZ' }],
    ['codePrefix only, no organizationId (active workspace)', { codePrefix: 'ZZ' }],
    ['codePrefix with a slug change', { slug: 'zz', codePrefix: 'ZZ' }],
  ])('organization/update never changes the prefix: %s', async (_, data) => {
    const cookie = await signedIn('qa-update@example.test');
    const created = workspaceSchema.parse(
      await (await create(cookie, { name: 'An Nhiên' }, randomUUID())).json(),
    );

    const response = await send('POST', '/api/auth/organization/update', { data }, { cookie });

    expect(response.status).toBeLessThan(500);
    const rows = await database.db.execute<{ code_prefix: string }>(
      sql`select code_prefix from organization where id = ${created.id}`,
    );
    expect(rows.rows).toEqual([{ code_prefix: 'AN' }]);
  });

  it('the same key from another user creates their own workspace with the same name', async () => {
    const key = randomUUID();
    const lan = await signedIn('qa-key-a@example.test');
    const minh = await signedIn('qa-key-b@example.test');

    const lanWorkspace = workspaceSchema.parse(
      await (await create(lan, { name: 'An Nhiên' }, key)).json(),
    );
    const response = await create(minh, { name: 'An Nhiên' }, key);

    expect(response.status).toBe(201);
    const minhWorkspace = workspaceSchema.parse(await response.json());
    expect(minhWorkspace.id).not.toBe(lanWorkspace.id);
    expect(minhWorkspace).toMatchObject({ name: 'An Nhiên', codePrefix: 'AN', role: 'admin' });
    expect(await organizationCount()).toBe(2);
  });

  it('a malformed JSON body is refused with 400, not a server error, and creates nothing', async () => {
    const cookie = await signedIn('qa-json@example.test');

    const response = await api.request('/api/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: TEST_WEB_ORIGIN,
        cookie,
        'idempotency-key': randomUUID(),
      },
      body: '{"name":',
    });

    expect(response.status).toBe(400);
    expect(await organizationCount()).toBe(0);
  });
});
