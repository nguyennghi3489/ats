// QA for issue #85, against the real API, the Compose Postgres and Mailpit: the edges the issue spec
// (sign-up.spec.ts) does not walk through in a browser. AUTH-02 copy in vi then en, the email body
// language and name, one request on repeated submits, the network error notice, and one account per
// email. The verification email is sent by the worker, so the Mailpit checks need it running.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-85!';
const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

/** One value from the Compose Postgres (`COMPOSE_PROJECT_NAME`, default `ats`). */
function queryValue(sql: string): string {
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
      '-tA',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

const submit = (page: Page) => page.getByTestId('sign-up-submit');

async function fill(page: Page, name: string, email: string, pass = password) {
  await page.getByTestId('sign-up-name').fill(name);
  await page.getByTestId('sign-up-email').fill(email);
  await page.getByTestId('sign-up-password').fill(pass);
}

test.describe('sign-up (QA #85)', () => {
  test.use({ locale: 'vi-VN' });

  test('AUTH-02 shows the invalid subtitle, field errors and notice in vi, then en', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sign-up');
    await fill(page, 'Minh Anh', 'minh.anh@', '1234');
    await submit(page).click();

    await expect(page.getByText(vi.auth.signUp.subtitleInvalid)).toBeVisible();
    await expect(page.getByText(vi.auth.signUp.subtitle)).toHaveCount(0);
    await expect(page.getByText(vi.auth.signUp.errors.EMAIL_INVALID)).toBeVisible();
    await expect(page.getByText(vi.auth.signUp.errors.PASSWORD_TOO_SHORT)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(vi.auth.signUp.invalidNotice);
    await page.screenshot({ path: test.info().outputPath('auth-02-vi-1440.png'), fullPage: true });

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText(en.auth.signUp.subtitleInvalid)).toBeVisible();
    await expect(page.getByText(en.auth.signUp.errors.EMAIL_INVALID)).toBeVisible();
    await expect(page.getByText(en.auth.signUp.errors.PASSWORD_TOO_SHORT)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(en.auth.signUp.invalidNotice);
    await expect(page.getByTestId('sign-up-password-toggle')).toHaveText(en.auth.signUp.show);
    await page.screenshot({ path: test.info().outputPath('auth-02-en-1440.png'), fullPage: true });
  });

  test('the Vietnamese email greets the trimmed name and links to verification', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85b-vi');
    await page.goto('/sign-up');
    await fill(page, '  Trần Minh Anh  ', `  ${email}  `);
    await submit(page).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);
    expect(new URL(page.url()).searchParams.get('email')).toBe(email);
    expect(queryValue(`select name from "user" where email = ${sqlString(email)}`)).toBe(
      'Trần Minh Anh',
    );
    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    expect(message.text).toContain('Xin chào Trần Minh Anh,');
    expect(message.text).toContain('Xác minh email');
    expect(message.text).toMatch(/https?:\/\/\S*verify-email\S*token=/);
  });

  test('the English email is English throughout', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85b-en');
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'English' }).click();
    await fill(page, 'Minh Anh', email);
    await submit(page).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);
    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    expect(message.text).toContain('Hello Minh Anh,');
    expect(message.text).toContain('Thanks for signing up for ATS.');
    expect(message.text).not.toContain('Xin chào');
  });

  test('clicking and pressing Enter while pending sends one sign-up request', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85b-once');
    let calls = 0;
    await page.route('**/api/auth/sign-up/email', async (route) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });
    await page.goto('/sign-up');
    await fill(page, 'Minh Anh', email);

    await submit(page).click();
    await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
    await submit(page).click({ force: true });
    await page.getByTestId('sign-up-password').press('Enter');

    await expect(page).toHaveURL(/\/verify-email\?email=/);
    expect(calls).toBe(1);
    expect(queryValue(`select count(*) from "user" where email = ${sqlString(email)}`)).toBe('1');
  });

  test('a network failure shows the translated notice and keeps the form (vi, then en)', async ({
    page,
  }, testInfo) => {
    await page.route('**/api/auth/sign-up/email', (route) => route.abort('internetdisconnected'));
    await page.goto('/sign-up');
    await fill(page, 'Minh Anh', uniqueEmail(testInfo, 'qa85b-net'));

    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(vi.errors.NETWORK_ERROR);
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByTestId('sign-up-name')).toHaveValue('Minh Anh');
    await expect(submit(page)).not.toHaveAttribute('aria-busy', 'true');

    await page.getByRole('button', { name: 'English' }).click();
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(en.errors.NETWORK_ERROR);
  });

  test('a second sign-up with the same email keeps one account', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85b-dup');
    for (const name of ['First Name', 'Second Name']) {
      await page.goto('/sign-up');
      await fill(page, name, email);
      await submit(page).click();
      await expect(page).toHaveURL(/\/verify-email\?email=/);
    }
    expect(queryValue(`select count(*) from "user" where email = ${sqlString(email)}`)).toBe('1');
    expect(queryValue(`select name from "user" where email = ${sqlString(email)}`)).toBe(
      'First Name',
    );
  });

  test('AUTH-02 in dark mode at 1440 px', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sign-up');
    await fill(page, 'Minh Anh', 'minh.anh@', '1234');
    await submit(page).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('auth-02-dark-1440.png'),
      fullPage: true,
    });
  });
});
