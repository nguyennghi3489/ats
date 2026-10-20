// Issue #84: the password reset link, followed in a real browser against the real API process.
// The reset screens (REC-01 to REC-06) are built in separate issues, so this checks where the link
// lands (`/reset-password?token=…`, then `/reset-password/invalid` once used) and the API rules
// around it, not the page content.
//
// The e2e servers do not run the email worker, so the token is read from the Compose Postgres
// (`COMPOSE_PROJECT_NAME`, default `ats`), as Better Auth stores it: `reset-password:<token>`.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { type APIRequestContext, expect, test } from '@playwright/test';

const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.E2E_API_URL || 'http://localhost:3000';
const oldPassword = 'qa84-Old-Password!';
const newPassword = 'qa84-New-Pass';

function psql(query: string): string {
  const project = process.env.COMPOSE_PROJECT_NAME || 'ats';
  return execFileSync(
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
      '-tA',
      '-c',
      query,
    ],
    { stdio: 'pipe' },
  )
    .toString()
    .trim();
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** The current reset tokens of `email`, as Better Auth stored them. */
function resetTokens(email: string): string[] {
  const out = psql(
    `select substr(v.identifier, ${'reset-password:'.length + 1}) from verification v ` +
      `join "user" u on u.id = v.value where u.email = ${quote(email)} ` +
      `and v.identifier like 'reset-password:%'`,
  );
  return out === '' ? [] : out.split('\n');
}

function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(path, { data, headers: { origin: baseURL } });
}

test.describe('password reset link', () => {
  test.use({ locale: 'vi-VN' });

  test('lands on the reset page, resets once, signs out sessions, then lands on the invalid page', async ({
    page,
    browser,
  }) => {
    const email = `qa84-${randomUUID()}@example.test`;
    const signUp = await post(page.request, '/api/auth/sign-up/email', {
      name: 'QA Tester',
      email,
      password: oldPassword,
      locale: 'vi',
    });
    expect(signUp.status()).toBe(200);
    psql(`update "user" set email_verified = true where email = ${quote(email)}`);

    // An existing session in another browser context.
    const other = await browser.newContext();
    const signedIn = await post(other.request, `${baseURL}/api/auth/sign-in/email`, {
      email,
      password: oldPassword,
    });
    expect(signedIn.status()).toBe(200);
    expect((await other.request.get(`${baseURL}/api/me`)).status()).toBe(200);

    const requested = await post(page.request, '/api/auth/request-password-reset', { email });
    expect(requested.status()).toBe(200);
    const tokens = resetTokens(email);
    expect(tokens).toHaveLength(1);
    const token = tokens[0] ?? '';
    // The link in the email: the API callback, with the web reset page as callbackURL.
    const link = `${apiURL}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(`${baseURL}/reset-password`)}`;

    await page.goto(link);
    await expect(page).toHaveURL(`${baseURL}/reset-password?token=${token}`);
    await page.screenshot({
      path: test.info().outputPath('reset-page-landing.png'),
      fullPage: true,
    });

    const tooShort = await post(page.request, '/api/auth/reset-password', {
      token,
      newPassword: '1234567',
    });
    expect(tooShort.status()).toBe(400);
    expect(await tooShort.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });

    const reset = await post(page.request, '/api/auth/reset-password', { token, newPassword });
    expect(reset.status()).toBe(200);

    expect((await other.request.get(`${baseURL}/api/me`)).status()).toBe(401);
    await other.close();

    await page.goto(link);
    await expect(page).toHaveURL(`${baseURL}/reset-password/invalid`);
    await page.screenshot({
      path: test.info().outputPath('reset-invalid-landing.png'),
      fullPage: true,
    });

    const fresh = await browser.newContext();
    const withOld = await post(fresh.request, `${baseURL}/api/auth/sign-in/email`, {
      email,
      password: oldPassword,
    });
    expect(withOld.status()).toBe(401);
    const withNew = await post(fresh.request, `${baseURL}/api/auth/sign-in/email`, {
      email,
      password: newPassword,
    });
    expect(withNew.status()).toBe(200);
    await fresh.close();
  });

  test('an unknown token lands on the invalid page', async ({ page }) => {
    await page.goto(
      `${apiURL}/api/auth/reset-password/not-a-real-token?callbackURL=${encodeURIComponent(`${baseURL}/reset-password`)}`,
    );
    await expect(page).toHaveURL(`${baseURL}/reset-password/invalid`);
  });

  test('an unknown email gets the same answer as a known one and no token', async ({ page }) => {
    const known = `qa84-known-${randomUUID()}@example.test`;
    expect(
      (
        await post(page.request, '/api/auth/sign-up/email', {
          name: 'QA Tester',
          email: known,
          password: oldPassword,
          locale: 'en',
        })
      ).status(),
    ).toBe(200);
    psql(`update "user" set email_verified = true where email = ${quote(known)}`);

    const knownAnswer = await post(page.request, '/api/auth/request-password-reset', {
      email: known,
    });
    const unknownAnswer = await post(page.request, '/api/auth/request-password-reset', {
      email: `qa84-unknown-${randomUUID()}@example.test`,
    });

    expect(unknownAnswer.status()).toBe(200);
    expect(await unknownAnswer.json()).toEqual(await knownAnswer.json());
    expect(resetTokens(known)).toHaveLength(1);
  });
});
