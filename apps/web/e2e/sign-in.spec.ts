// Issue #88: the sign-in screen (design SIGN-01 to SIGN-04) against the real API and the Compose
// Postgres. Users are synthetic and unique per test; they are created through the app's own auth
// client and marked verified with psql. The blocked state is answered by a mocked route, because the
// real limit needs ten failed sign-ins.
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-88!';
const copy = vi.auth.signIn;

/** Creates an account for `email` through the app's auth client; verified unless told otherwise. */
async function createUser(page: Page, email: string, options: { verified?: boolean } = {}) {
  await page.goto('/sign-up');
  await page.evaluate(
    async ([clientPath, input]) => {
      const { authApi } = (await import(/* @vite-ignore */ clientPath)) as {
        authApi: { signUp: (i: unknown) => Promise<unknown> };
      };
      await authApi.signUp(input);
    },
    [
      '/src/features/auth/auth-client.ts',
      { name: 'QA Sign In', email, password, locale: 'vi' },
    ] as const,
  );
  if (options.verified !== false) {
    psql(`update "user" set email_verified = true where email = ${sqlString(email)}`);
  }
}

async function newUser(page: Page, testInfo: TestInfo, options: { verified?: boolean } = {}) {
  const email = uniqueEmail(testInfo, 'qa88');
  await createUser(page, email, options);
  return email;
}

const emailField = (page: Page) => page.getByTestId('sign-in-email');
const passwordField = (page: Page) => page.getByTestId('sign-in-password');
const submit = (page: Page) => page.getByTestId('sign-in-submit');

async function signIn(page: Page, email: string, secret = password) {
  await emailField(page).fill(email);
  await passwordField(page).fill(secret);
  await submit(page).click();
}

test.describe('sign-in', () => {
  // A Vietnamese browser, so the page opens in Vietnamese; the EN tests switch explicitly.
  test.use({ locale: 'vi-VN' });

  test('shows the SIGN-01 form without provider buttons', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
    await expect(page.getByLabel(copy.email)).toBeVisible();
    await expect(page.getByLabel(copy.password, { exact: true })).toBeVisible();
    await expect(submit(page)).toHaveText(copy.submit);
    await expect(page.getByRole('link', { name: copy.forgotPassword })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    await expect(page.getByRole('link', { name: copy.signUp })).toHaveAttribute('href', '/sign-up');
    await expect(page.getByText(/Google|Microsoft|passkey/i)).toHaveCount(0);
    await expect(page.getByText('hoặc', { exact: true })).toHaveCount(0);
  });

  test('a verified user signs in and lands on /', async ({ page }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/sign-in');

    await signIn(page, email);

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('placeholder-page')).toBeVisible();
  });

  test('redirect=%2Fjobs lands on /jobs after signing in', async ({ page }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/sign-in?redirect=%2Fjobs');

    await signIn(page, email);

    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('an off-site redirect lands on /jobs instead', async ({ page }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/sign-in?redirect=https%3A%2F%2Fevil.example');

    await signIn(page, email);

    // The fallback `/` opens `/jobs` (#113).
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/jobs$/);
  });

  test('a wrong password shows SIGN-03, keeps the email and clears the password', async ({
    page,
  }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/sign-in');

    await signIn(page, email, 'wrong-Password-1');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.failedTitle);
    await expect(page.getByRole('alert')).toHaveText(vi.errors.INVALID_CREDENTIALS);
    await expect(submit(page)).toHaveText(copy.retry);
    await expect(emailField(page)).toHaveValue(email);
    await expect(passwordField(page)).toHaveValue('');
    await expect(page).toHaveURL(/\/sign-in$/);

    await passwordField(page).fill(password);
    await submit(page).click();
    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('an unverified user sees the not-verified message and the link to verify', async ({
    page,
  }, testInfo) => {
    const email = await newUser(page, testInfo, { verified: false });
    await page.goto('/sign-in');

    await signIn(page, email);

    await expect(page.getByRole('alert')).toContainText(vi.errors.EMAIL_NOT_VERIFIED);
    await expect(page.getByRole('link', { name: copy.resendVerification })).toHaveAttribute(
      'href',
      `/verify-email?email=${encodeURIComponent(email)}`,
    );
  });

  test('a blocked sign-in shows the wait in minutes', async ({ page }) => {
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '600' },
        body: JSON.stringify({
          code: 'SIGN_IN_RATE_LIMITED',
          message: 'Too many failed sign-ins. Try again later.',
          retryAfterSeconds: 600,
        }),
      }),
    );
    await page.goto('/sign-in');

    await signIn(page, 'blocked@example.test');

    await expect(page.getByRole('alert')).toHaveText(
      'Bạn đã đăng nhập sai quá nhiều lần. Thử lại sau 10 phút.',
    );
  });

  test('expired=1 shows the session-expired notice in VI and EN', async ({ page }) => {
    await page.goto('/sign-in?redirect=%2Fjobs&expired=1');

    await expect(page.getByTestId('sign-in-expired')).toContainText('Phiên đăng nhập đã hết hạn');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByTestId('sign-in-expired')).toHaveText(en.auth.signIn.expired);
  });

  test('the button is busy while signing in, Enter submits and double clicks send one request', async ({
    page,
  }, testInfo) => {
    const email = await newUser(page, testInfo);
    let requests = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/auth/sign-in/email', async (route) => {
      requests += 1;
      await held;
      await route.continue();
    });
    await page.goto('/sign-in');

    await emailField(page).fill(email);
    await passwordField(page).fill(password);
    await passwordField(page).press('Enter');

    await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
    await expect(submit(page)).toHaveText(copy.submitPending);
    await expect(submit(page).locator('svg')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.pendingTitle);
    await submit(page).dblclick();
    await passwordField(page).press('Enter');

    release();
    await expect(page).toHaveURL(/\/jobs$/);
    expect(requests).toBe(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`matches SIGN-01/03 at 1440 px and SIGN-04 at 360 px (${scheme})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sign-in');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
      await page.screenshot({ path: testInfo.outputPath(`sign-01-${scheme}.png`), fullPage: true });

      await page.route('**/api/auth/sign-in/email', (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid' }),
        }),
      );
      await signIn(page, 'minh.anh@example.test', 'wrong-Password-1');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.failedTitle);
      await page.screenshot({ path: testInfo.outputPath(`sign-03-${scheme}.png`), fullPage: true });

      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/sign-in');
      await expect(page.getByTestId('auth-subtitle')).toBeHidden();
      const forgot = await page.getByTestId('sign-in-forgot-link').boundingBox();
      const signUp = await page.getByTestId('sign-in-sign-up-link').boundingBox();
      expect(forgot && signUp && forgot.y === signUp.y).toBe(true);
      expect(forgot!.height).toBeGreaterThanOrEqual(44);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(360);
      await page.screenshot({ path: testInfo.outputPath(`sign-04-${scheme}.png`), fullPage: true });
    });
  }
});
