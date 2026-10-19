// Issue #81: the web auth client and the session store, driven in a real browser against the real API
// through the Vite dev server proxy. No screen uses the store yet, so the checks import the app's own
// modules from the dev server (same instances the mounted app uses) and watch the 404 page's copy.
//
// Sign-in needs a verified email and the API sends no verification mail yet, so the test marks its
// synthetic user verified in the Compose Postgres (`COMPOSE_PROJECT_NAME`, default `ats`).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };

const missingPath = '/khong-ton-tai';
const password = 'qa-Password-81!';
const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

interface StoreSnapshot {
  status: string;
  user: { email: string; locale: string } | null;
  error?: { name: string; code: string; status: number };
}

function markVerified(email: string): void {
  const project = process.env.COMPOSE_PROJECT_NAME || 'ats';
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      '-p',
      project,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'ats',
      '-d',
      'ats',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `update "user" set email_verified = true where email = '${email.replace(/'/g, "''")}'`,
    ],
    { stdio: 'pipe' },
  );
}

/** Runs `action` on the app's auth client and session store inside the page. */
async function inPage(
  page: Page,
  action: 'load' | 'signOut' | 'signUp' | 'signIn',
  input?: Record<string, unknown>,
): Promise<StoreSnapshot> {
  return page.evaluate(
    async ([storePath, clientPath, act, arg]) => {
      type Store = {
        status: string;
        user: { email: string; locale: string } | null;
        load: () => Promise<void>;
        signOut: () => Promise<void>;
      };
      const { useSessionStore } = (await import(/* @vite-ignore */ storePath)) as {
        useSessionStore: () => Store;
      };
      const { authApi } = (await import(/* @vite-ignore */ clientPath)) as {
        authApi: Record<'signUp' | 'signIn', (i: unknown) => Promise<unknown>>;
      };
      const session = useSessionStore();
      let error: StoreSnapshot['error'];
      try {
        if (act === 'load') await session.load();
        else if (act === 'signOut') await session.signOut();
        else await authApi[act](arg);
      } catch (e) {
        const err = e as { name: string; code: string; status: number };
        error = { name: err.name, code: err.code, status: err.status };
      }
      return {
        status: session.status,
        user: session.user ? { email: session.user.email, locale: session.user.locale } : null,
        error,
      };
    },
    [
      '/src/features/auth/session.store.ts',
      '/src/features/auth/auth-client.ts',
      action,
      input ?? null,
    ] as const,
  );
}

test.describe('session store against the real API', () => {
  test.use({ locale: 'vi-VN' });

  test('load() without a session is signed out, without throwing', async ({ page }) => {
    await page.goto(missingPath);
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);

    const result = await inPage(page, 'load');

    expect(result).toEqual({ status: 'signed-out', user: null, error: undefined });
  });

  test('a Better Auth error surfaces as ApiError with the API code', async ({ page }) => {
    await page.goto(missingPath);

    const result = await inPage(page, 'signIn', {
      email: `qa81-nobody-${Date.now()}@example.test`,
      password,
    });

    expect(result.error).toEqual({
      name: 'ApiError',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      status: 401,
    });
  });

  test('sign up, sign in, load() for an en user shows English, then signOut()', async ({
    page,
  }) => {
    const email = `qa81-${Date.now()}-${test.info().workerIndex}@example.test`;
    await page.goto(missingPath);
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);
    await page.screenshot({ path: test.info().outputPath('before-load-vi.png'), fullPage: true });

    const signUp = await inPage(page, 'signUp', {
      name: 'QA Tester',
      email,
      password,
      locale: 'en',
    });
    expect(signUp.error).toBeUndefined();
    markVerified(email);

    const signIn = await inPage(page, 'signIn', { email, password });
    expect(signIn.error).toBeUndefined();

    const loaded = await inPage(page, 'load');
    expect(loaded).toEqual({
      status: 'signed-in',
      user: { email, locale: 'en' },
      error: undefined,
    });
    await expect(page.getByTestId('not-found-title')).toHaveText(en.notFound.title);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.screenshot({ path: test.info().outputPath('after-load-en.png'), fullPage: true });

    const signedOut = await inPage(page, 'signOut');
    expect(signedOut).toEqual({ status: 'signed-out', user: null, error: undefined });

    // The server session is gone too: a fresh load() answers signed out.
    const reloaded = await inPage(page, 'load');
    expect(reloaded).toEqual({ status: 'signed-out', user: null, error: undefined });
  });
});

// QA for #81: the failure paths of load() in the browser. The /api/me answer is replaced in flight so
// the real store, API client and schema parsing run unchanged; the page must stay Vietnamese.
test.describe('session store when GET /api/me misbehaves', () => {
  test.use({ locale: 'vi-VN' });

  test('a malformed /api/me response is an error, not signed in, and the page stays vi', async ({
    page,
  }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u-qa81', email: 'not-an-email', locale: 'en' } }),
      }),
    );
    await page.goto(missingPath);
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);

    const result = await inPage(page, 'load');

    expect(result.error).toEqual({ name: 'ApiError', code: 'UNKNOWN_ERROR', status: 200 });
    expect(result.status).not.toBe('signed-in');
    expect(result.user).toBeNull();
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.screenshot({ path: test.info().outputPath('malformed-me-vi.png'), fullPage: true });
  });

  test('a server error from /api/me is rethrown as ApiError and leaves the status unknown', async ({
    page,
  }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR' }),
      }),
    );
    await page.goto(missingPath);

    const result = await inPage(page, 'load');

    expect(result).toEqual({
      status: 'unknown',
      user: null,
      error: { name: 'ApiError', code: 'INTERNAL_ERROR', status: 500 },
    });
  });
});
