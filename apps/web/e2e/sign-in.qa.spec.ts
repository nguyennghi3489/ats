// QA for issue #88: what sign-in.spec.ts leaves out. The SIGN-02 pending state in VI and EN (busy
// button with a spinner, copy as the design), the SIGN-03 / not-verified / blocked messages in English, the
// minute count rounding up, and `session.load()` asking the API who signed in. Users are synthetic and
// unique per test, created through the app's auth client against the Compose stack.
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-88!';

async function newUser(page: Page, testInfo: TestInfo, options: { verified?: boolean } = {}) {
  const email = uniqueEmail(testInfo, 'qa88b');
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
  return email;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const submit = (page: Page) => page.getByTestId('sign-in-submit');

async function fill(page: Page, email: string, secret = password) {
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(secret);
}

function blockedAfter(page: Page, retryAfterSeconds?: number) {
  return page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'SIGN_IN_RATE_LIMITED',
        message: 'Too many failed sign-ins. Try again later.',
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      }),
    }),
  );
}

for (const [lang, browserLocale, copy] of [
  ['vi', 'vi-VN', vi],
  ['en', 'en-US', en],
] as const) {
  test.describe(`sign-in QA (${lang})`, () => {
    test.use({ locale: browserLocale });

    test(`SIGN-02: the pending state shows the design copy and a busy button (${lang})`, async ({
      page,
    }, testInfo) => {
      const email = await newUser(page, testInfo);
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/auth/sign-in/email', async (route) => {
        await held;
        await route.continue();
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sign-in');
      await expect(heading(page)).toHaveText(copy.auth.signIn.title);
      await fill(page, email);
      await submit(page).click();

      await expect(heading(page)).toHaveText(copy.auth.signIn.pendingTitle);
      await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.auth.signIn.pendingSubtitle);
      await expect(page.getByTestId('sign-in-pending')).toHaveText(copy.auth.signIn.pendingNotice);
      await expect(submit(page)).toHaveText(copy.auth.signIn.submitPending);
      // AtsButton's Pending state (design 01 · Button "Primary · Pending") is busy and swallows
      // clicks rather than carrying the native `disabled` attribute, so it keeps focus.
      await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
      await expect(submit(page).locator('svg')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`sign-02-${lang}.png`), fullPage: true });

      const me = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/me');
      release();
      await me;
      await expect(page).toHaveURL(/\/jobs$/);
    });

    test(`SIGN-03 copy after a wrong password against the real API (${lang})`, async ({
      page,
    }, testInfo) => {
      const email = await newUser(page, testInfo);
      await page.goto('/sign-in');
      await expect(heading(page)).toHaveText(copy.auth.signIn.title);
      await fill(page, email, 'wrong-Password-1');
      await page.getByTestId('sign-in-password').press('Enter');

      await expect(heading(page)).toHaveText(copy.auth.signIn.failedTitle);
      await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.auth.signIn.failedSubtitle);
      await expect(page.getByRole('alert')).toHaveText(copy.errors.INVALID_CREDENTIALS);
      await expect(submit(page)).toHaveText(copy.auth.signIn.retry);
      await expect(page.getByTestId('sign-in-email')).toHaveValue(email);
      await expect(page.getByTestId('sign-in-password')).toHaveValue('');
      await expect(page.getByTestId('sign-in-password')).toBeFocused();
    });

    test(`not-verified message and link to /verify-email (${lang})`, async ({ page }, testInfo) => {
      const email = await newUser(page, testInfo, { verified: false });
      await page.goto('/sign-in');
      await expect(heading(page)).toHaveText(copy.auth.signIn.title);
      await fill(page, email);
      await submit(page).click();

      await expect(page.getByRole('alert')).toContainText(copy.errors.EMAIL_NOT_VERIFIED);
      const link = page.getByRole('link', { name: copy.auth.signIn.resendVerification });
      await expect(link).toHaveAttribute(
        'href',
        `/verify-email?email=${encodeURIComponent(email)}`,
      );
      await expect(page).toHaveURL(/\/sign-in$/);
    });

    test(`blocked for 600 s says 10 minutes (${lang})`, async ({ page }) => {
      await blockedAfter(page, 600);
      await page.goto('/sign-in');
      await fill(page, 'blocked@example.test');
      await submit(page).click();

      const expected =
        lang === 'vi'
          ? 'Bạn đã đăng nhập sai quá nhiều lần. Thử lại sau 10 phút.'
          : 'Too many failed sign-ins. Try again in 10 minutes.';
      await expect(page.getByRole('alert')).toHaveText(expected);
      // A block is not the SIGN-03 credentials state.
      await expect(heading(page)).toHaveText(copy.auth.signIn.title);
    });
  });
}

test.describe('sign-in QA (rate-limit rounding)', () => {
  test.use({ locale: 'en-US' });

  test('61 s rounds up to 2 minutes, 30 s reads 1 minute, a missing value falls back', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await fill(page, 'blocked@example.test');

    await blockedAfter(page, 61);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Too many failed sign-ins. Try again in 2 minutes.',
    );

    await page.unrouteAll();
    await blockedAfter(page, 30);
    await page.getByTestId('sign-in-password').fill(password);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Too many failed sign-ins. Try again in 1 minute.',
    );

    await page.unrouteAll();
    await blockedAfter(page);
    await page.getByTestId('sign-in-password').fill(password);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(en.errors.SIGN_IN_RATE_LIMITED);
  });
});

// QA round 2 for #88: the real failed sign-in limit (#83) end to end, the EN layout at 1440 and
// 360 px, the "Hiện" toggle and Enter from the email field.
test.describe('sign-in QA (real limit, EN layout, toggle)', () => {
  test.use({ locale: 'vi-VN' });

  test('after 10 real failures the 11th attempt shows the blocked wait in minutes, vi then en', async ({
    page,
  }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/sign-in');
    const statuses = await page.evaluate(async (address) => {
      const codes: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const response = await fetch('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: address, password: 'wrong-Password-1' }),
        });
        codes.push(response.status);
      }
      return codes;
    }, email);
    expect(statuses.every((status) => status === 401)).toBe(true);

    // Even the right password is refused while the window lasts (15 minutes, decisions §2).
    await fill(page, email);
    await submit(page).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Bạn đã đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.',
    );
    await expect(heading(page)).toHaveText(vi.auth.signIn.title);
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Too many failed sign-ins. Try again in 15 minutes.',
    );
  });

  test('Enter in the email field submits; "Hiện" shows and hides the password without submitting', async ({
    page,
  }, testInfo) => {
    const email = await newUser(page, testInfo);
    let requests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/sign-in/email') requests += 1;
    });
    await page.goto('/sign-in');
    await fill(page, email);

    const toggle = page.getByTestId('sign-in-password-toggle');
    await expect(toggle).toHaveText(vi.auth.signIn.show);
    await toggle.click();
    await expect(page.getByTestId('sign-in-password')).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveText(vi.auth.signIn.hide);
    await expect(toggle).toHaveAccessibleName(vi.auth.signIn.hidePassword);
    await toggle.click();
    await expect(page.getByTestId('sign-in-password')).toHaveAttribute('type', 'password');
    expect(requests).toBe(0);

    await page.getByTestId('sign-in-email').press('Enter');
    await expect(page).toHaveURL(/\/jobs$/);
    expect(requests).toBe(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`EN: SIGN-01/03 at 1440 px and SIGN-04 at 360 px (${scheme})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sign-in');
      await expect(heading(page)).toHaveText(vi.auth.signIn.title);
      await page.getByRole('button', { name: 'English' }).click();
      await expect(heading(page)).toHaveText(en.auth.signIn.title);
      await expect(page.getByTestId('auth-subtitle')).toHaveText(en.auth.signIn.subtitle);
      await expect(page.getByTestId('sign-in-password-toggle')).toHaveText(en.auth.signIn.show);
      await expect(submit(page)).toHaveText(en.auth.signIn.submit);
      await expect(page.getByTestId('sign-in-forgot-link')).toHaveText(
        en.auth.signIn.forgotPassword,
      );
      await expect(page.getByTestId('sign-in-sign-up-link')).toHaveText(en.auth.signIn.signUp);
      await expect(page.getByText(/Google|Microsoft|passkey/i)).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`en-sign-01-${scheme}.png`),
        fullPage: true,
      });

      await page.route('**/api/auth/sign-in/email', (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid' }),
        }),
      );
      await fill(page, 'minh.anh@example.test', 'wrong-Password-1');
      await submit(page).click();
      await expect(heading(page)).toHaveText(en.auth.signIn.failedTitle);
      await expect(page.getByRole('alert')).toHaveText(en.errors.INVALID_CREDENTIALS);
      await expect(submit(page)).toHaveText(en.auth.signIn.retry);
      await page.screenshot({
        path: testInfo.outputPath(`en-sign-03-${scheme}.png`),
        fullPage: true,
      });

      // The language choice is kept, so the reload at 360 px opens in English.
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/sign-in');
      await expect(heading(page)).toHaveText(en.auth.signIn.title);
      await expect(page.getByTestId('auth-subtitle')).toBeHidden();
      const forgot = await page.getByTestId('sign-in-forgot-link').boundingBox();
      const signUp = await page.getByTestId('sign-in-sign-up-link').boundingBox();
      expect(forgot && signUp && forgot.y === signUp.y).toBe(true);
      expect(signUp!.height).toBeGreaterThanOrEqual(44);
      const toggle = await page.getByTestId('sign-in-password-toggle').boundingBox();
      expect(toggle!.height).toBeGreaterThanOrEqual(44);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(360);
      await page.screenshot({
        path: testInfo.outputPath(`en-sign-04-${scheme}.png`),
        fullPage: true,
      });
    });
  }
});
