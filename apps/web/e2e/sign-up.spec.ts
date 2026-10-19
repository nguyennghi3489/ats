// Issue #85: the sign-up screen (design AUTH-01, AUTH-02) against the real API, the Compose Postgres
// and Mailpit. The verification email is delivered by the worker (`pnpm --filter api worker:dev`),
// so the Mailpit checks need it running. Addresses are synthetic and unique per test.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-85!';
const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

/** The stored `locale` of the user with `email`, read from the Compose Postgres. */
function storedLocale(email: string): string {
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
      `select locale from "user" where email = ${sqlString(email)}`,
    ],
    { encoding: 'utf8' },
  ).trim();
}

const nameField = (page: Page) => page.getByTestId('sign-up-name');
const emailField = (page: Page) => page.getByTestId('sign-up-email');
const passwordField = (page: Page) => page.getByTestId('sign-up-password');
const toggle = (page: Page) => page.getByTestId('sign-up-password-toggle');
const submit = (page: Page) => page.getByTestId('sign-up-submit');

async function signUp(page: Page, email: string) {
  await nameField(page).fill('QA Sign Up');
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await submit(page).click();
}

const checkEmailUrl = (email: string) =>
  new RegExp(`/verify-email\\?email=${encodeURIComponent(email).replace(/\./g, '\\.')}$`);

test.describe('sign-up', () => {
  // A Vietnamese browser, so the page opens in Vietnamese; the EN test switches explicitly.
  test.use({ locale: 'vi-VN' });

  test('shows the AUTH-01 form without provider buttons', async ({ page }) => {
    await page.goto('/sign-up');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.auth.signUp.title);
    await expect(page.getByLabel(vi.auth.signUp.name)).toBeVisible();
    await expect(page.getByLabel(vi.auth.signUp.email)).toBeVisible();
    await expect(page.getByLabel(vi.auth.signUp.password, { exact: true })).toBeVisible();
    await expect(page.getByText(vi.auth.signUp.passwordHelper)).toBeVisible();
    await expect(submit(page)).toHaveText(vi.auth.signUp.submit);
    await expect(page.getByRole('link', { name: vi.auth.signUp.signIn })).toHaveAttribute(
      'href',
      '/sign-in',
    );
    await expect(page.getByText(/Google|Microsoft|passkey/i)).toHaveCount(0);
    await expect(page.getByText('hoặc', { exact: true })).toHaveCount(0);
  });

  test('flags an incomplete email and a short password without sending anything', async ({
    page,
  }) => {
    await page.goto('/sign-up');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/')) requests.push(request.url());
    });

    await nameField(page).fill('Minh Anh');
    await emailField(page).fill('minh.anh@');
    await passwordField(page).fill('1234');
    await submit(page).click();

    await expect(page.getByText('Nhập địa chỉ email hợp lệ')).toBeVisible();
    await expect(page.getByText('Mật khẩu cần ít nhất 8 ký tự')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText(
      'Chưa thể tạo tài khoản. Kiểm tra thông tin phía trên.',
    );
    await expect(emailField(page)).toBeFocused();
    expect(requests).toEqual([]);
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('"Hiện" shows and hides the password from the keyboard', async ({ page }) => {
    await page.goto('/sign-up');
    await passwordField(page).fill('secret-pass');

    await passwordField(page).focus();
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(passwordField(page)).toHaveAttribute('type', 'text');
    await expect(toggle(page)).toHaveText(vi.auth.signUp.hide);

    await page.keyboard.press('Space');
    await expect(passwordField(page)).toHaveAttribute('type', 'password');
    await expect(toggle(page)).toHaveText(vi.auth.signUp.show);
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('a valid sign-up opens the check-email page and sends the Vietnamese email', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85-vi');
    await page.goto('/sign-up');

    await signUp(page, email);

    await expect(page).toHaveURL(checkEmailUrl(email));
    expect(storedLocale(email)).toBe('vi');
    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    expect(message.subject).toBe('Xác minh email của bạn trên ATS');
  });

  test('signing up in English stores locale en and sends the English email', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85-en');
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.signUp.title);

    await signUp(page, email);

    await expect(page).toHaveURL(checkEmailUrl(email));
    expect(storedLocale(email)).toBe('en');
    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    expect(message.subject).toBe('Verify your email for ATS');
  });

  test('signing up again with the same email also opens the check-email page', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa85-again');
    await page.goto('/sign-up');
    await signUp(page, email);
    await expect(page).toHaveURL(checkEmailUrl(email));

    await page.goto('/sign-up');
    await signUp(page, email);

    await expect(page).toHaveURL(checkEmailUrl(email));
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no horizontal scrolling at 360 px (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/sign-up');
      await submit(page).click();
      await expect(page.getByRole('alert')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: test.info().outputPath(`sign-up-360-${colorScheme}.png`),
        fullPage: true,
      });
    });

    test(`renders at 1440 px (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sign-up');

      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      const card = page.locator('.auth-layout__card');
      expect((await card.boundingBox())?.width).toBe(448);
      await page.screenshot({
        path: test.info().outputPath(`sign-up-1440-${colorScheme}.png`),
        fullPage: true,
      });
    });
  }
});
