import { meResponseSchema } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'correct-horse-battery-staple';

type UserRow = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  locale: string;
};

type SessionRow = {
  token: string;
  user_id: string;
  expires_at: Date;
};

describe('authentication (Better Auth, sessions in Postgres)', () => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  function post(path: string, body: unknown) {
    return api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
      body: JSON.stringify(body),
    });
  }

  function signUp(email: string, extra: Record<string, unknown> = {}) {
    return post('/api/auth/sign-up/email', {
      name: 'Lan Nguyen',
      email,
      password: PASSWORD,
      ...extra,
    });
  }

  function signIn(email: string, password = PASSWORD) {
    return post('/api/auth/sign-in/email', { email, password });
  }

  function me(cookie?: string) {
    return api.request('/api/me', { headers: cookie ? { cookie } : {} });
  }

  async function users(): Promise<UserRow[]> {
    const result = await database.db.execute<UserRow>(
      sql`select id, name, email, email_verified, locale from "user" order by email`,
    );
    return result.rows;
  }

  async function sessions(): Promise<SessionRow[]> {
    const result = await database.db.execute<SessionRow>(
      sql`select token, user_id, expires_at from "session" order by created_at`,
    );
    return result.rows;
  }

  async function markVerified(email: string): Promise<void> {
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
  }

  function sessionSetCookie(response: Response): string | undefined {
    return response.headers.getSetCookie().find((cookie) => /session_token=/.test(cookie));
  }

  /** The `name=value` pair of the session cookie set by `response`, ready for a `cookie` header. */
  function sessionCookie(response: Response): string {
    const cookie = sessionSetCookie(response);
    expect(cookie, 'session cookie').toBeDefined();
    return cookie?.split(';')[0] ?? '';
  }

  /** Signs up, verifies and signs in; returns the session cookie. */
  async function signedIn(email: string): Promise<string> {
    expect((await signUp(email)).status).toBe(200);
    await markVerified(email);
    const response = await signIn(email);
    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  describe('sign-up with email and password', () => {
    it('creates an unverified user with locale "vi" and no session', async () => {
      const response = await signUp('lan@example.test');

      expect(response.status).toBe(200);
      expect(await users()).toEqual([
        expect.objectContaining({
          name: 'Lan Nguyen',
          email: 'lan@example.test',
          email_verified: false,
          locale: 'vi',
        }),
      ]);
      expect(await sessions()).toEqual([]);
      expect(sessionSetCookie(response)).toBeUndefined();
    });

    it('keeps the locale the browser chose when it is "en"', async () => {
      expect((await signUp('minh@example.test', { locale: 'en' })).status).toBe(200);

      expect((await users())[0]?.locale).toBe('en');
    });

    it('refuses a locale other than vi or en', async () => {
      const response = await signUp('khoa@example.test', { locale: 'fr' });

      expect(response.status).toBe(400);
      expect(await users()).toEqual([]);
    });

    it('does not let the client mark the email as verified', async () => {
      await signUp('tuan@example.test', { emailVerified: true });

      expect((await users())[0]?.email_verified ?? false).toBe(false);
    });
  });

  describe('sign-in', () => {
    it('is refused while the email is unverified', async () => {
      await signUp('lan@example.test');

      const response = await signIn('lan@example.test');

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
      expect(await sessions()).toEqual([]);
      expect(sessionSetCookie(response)).toBeUndefined();
    });

    it('sets an HttpOnly, SameSite=Lax, Secure cookie and stores the session in Postgres', async () => {
      await signUp('lan@example.test');
      await markVerified('lan@example.test');

      const response = await signIn('lan@example.test');

      expect(response.status).toBe(200);
      const setCookie = sessionSetCookie(response);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      // The test app runs with NODE_ENV=test: outside development the cookie is Secure.
      expect(setCookie).toMatch(/;\s*Secure/i);
      const [user] = await users();
      const rows = await sessions();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_id).toBe(user?.id);
    });

    it('is refused with a wrong password', async () => {
      await signUp('lan@example.test');
      await markVerified('lan@example.test');

      const response = await signIn('lan@example.test', 'wrong-password-123');

      expect(response.status).toBe(401);
      expect(await sessions()).toEqual([]);
    });

    it('is refused from an origin other than the web app', async () => {
      await signUp('lan@example.test');
      await markVerified('lan@example.test');

      const response = await api.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example.test' },
        body: JSON.stringify({ email: 'lan@example.test', password: PASSWORD }),
      });

      expect(response.status).toBe(403);
      expect(await sessions()).toEqual([]);
    });
  });

  describe('GET /api/me', () => {
    it('returns the signed-in user', async () => {
      const cookie = await signedIn('lan@example.test');
      const [user] = await users();

      const response = await me(cookie);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toEqual({
        user: {
          id: user?.id,
          name: 'Lan Nguyen',
          email: 'lan@example.test',
          locale: 'vi',
          emailVerified: true,
        },
      });
      expect(meResponseSchema.safeParse(body).success).toBe(true);
    });

    it('returns 401 UNAUTHENTICATED without a session cookie', async () => {
      const response = await me();

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('returns 401 UNAUTHENTICATED with a forged cookie', async () => {
      const cookie = await signedIn('lan@example.test');
      const name = cookie.split('=')[0] ?? '';

      const response = await me(`${name}=forged.value`);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('returns 401 as soon as the session row is deleted (no cookie cache)', async () => {
      const cookie = await signedIn('lan@example.test');
      expect((await me(cookie)).status).toBe(200);

      await database.db.execute(sql`delete from "session"`);

      const response = await me(cookie);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    });
  });

  describe('session lifetime', () => {
    const signInAt = new Date('2026-10-01T08:00:00.000Z');

    async function expiresAt(): Promise<number> {
      const [row] = await sessions();
      return new Date(row?.expires_at ?? 0).getTime();
    }

    it('lasts 30 days from sign-in', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signInAt });

      await signedIn('lan@example.test');

      expect(await expiresAt()).toBe(signInAt.getTime() + 30 * DAY_MS);
    });

    it('is not extended when used within a day', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signInAt });
      const cookie = await signedIn('lan@example.test');

      vi.setSystemTime(signInAt.getTime() + 12 * 60 * 60 * 1000);
      expect((await me(cookie)).status).toBe(200);

      expect(await expiresAt()).toBe(signInAt.getTime() + 30 * DAY_MS);
    });

    it('is extended to 30 days from use when used after a day', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signInAt });
      const cookie = await signedIn('lan@example.test');

      const usedAt = signInAt.getTime() + 2 * DAY_MS;
      vi.setSystemTime(usedAt);
      const response = await me(cookie);

      expect(response.status).toBe(200);
      expect(await expiresAt()).toBe(usedAt + 30 * DAY_MS);
      // The browser cookie is extended too.
      expect(sessionSetCookie(response)).toMatch(/Max-Age=2592000/i);
    });

    it('ends after 30 days without use', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: signInAt });
      const cookie = await signedIn('lan@example.test');

      vi.setSystemTime(signInAt.getTime() + 30 * DAY_MS + 60_000);
      const response = await me(cookie);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    });
  });
});
