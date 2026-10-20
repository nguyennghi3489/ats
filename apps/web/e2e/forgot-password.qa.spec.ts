// QA for issue #89: what forgot-password.spec.ts leaves out. A real RESEND_TOO_SOON from the API on
// the request form, for an address with and without an account (same message, no enumeration), no
// email reaching an unknown address, the limit message on the first request in VI and EN, the EN
// field error without a request, and the EN layout of REC-01 / REC-02 at 1440 and 360 px, light and
// dark. Users are synthetic and unique per test, created through the app's auth client.
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { psql, sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-89b!';
const REQUEST_ROUTE = '**/api/auth/request-password-reset';
const RESET_LINK = '/api/auth/reset-password/';

async function newUser(page: Page, testInfo: TestInfo): Promise<string> {
  const email = uniqueEmail(testInfo, 'qa89b');
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
      { name: 'QA Forgot Password', email, password, locale: 'vi' },
    ] as const,
  );
  psql(`update "user" set email_verified = true where email = ${sqlString(email)}`);
  return email;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const emailField = (page: Page) => page.getByTestId('forgot-password-email');
const submit = (page: Page) => page.getByTestId('forgot-password-submit');
const resend = (page: Page) => page.getByTestId('forgot-password-resend');

async function requestReset(page: Page, email: string) {
  const answered = page.waitForResponse((r) =>
    r.url().endsWith('/api/auth/request-password-reset'),
  );
  await emailField(page).fill(email);
  await submit(page).click();
  return answered;
}

function limitRoute(page: Page) {
  return page.route(REQUEST_ROUTE, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '1800' },
      body: JSON.stringify({
        code: 'RESEND_LIMIT',
        message: 'RESEND_LIMIT',
        retryAfterSeconds: 1800,
      }),
    }),
  );
}

test.describe('forgot password QA (vi)', () => {
  test.use({ locale: 'vi-VN' });
  const copy = vi.auth.forgotPassword;

  test('a second request within 60 s shows the translated RESEND_TOO_SOON message, the same for a known and an unknown address', async ({
    page,
  }, testInfo) => {
    const known = await newUser(page, testInfo);
    const unknown = `unknown-${uniqueEmail(testInfo, 'qa89b')}`;
    const messages: string[] = [];

    for (const address of [known, unknown]) {
      await page.goto('/forgot-password');
      expect((await requestReset(page, address)).status()).toBe(200);
      await expect(heading(page)).toHaveText(copy.sentTitle);

      await page.goto(`/forgot-password?email=${encodeURIComponent(address)}`);
      await expect(emailField(page)).toHaveValue(address);
      const answered = page.waitForResponse((r) =>
        r.url().endsWith('/api/auth/request-password-reset'),
      );
      await submit(page).click();
      expect((await answered).status()).toBe(429);

      // The form stays: no REC-02, the translated message, never the API's English text.
      await expect(heading(page)).toHaveText(copy.title);
      await expect(page.getByRole('alert')).toHaveText(copy.errors.RESEND_TOO_SOON);
      messages.push((await page.getByRole('alert').textContent()) ?? '');
    }
    expect(messages[1]).toBe(messages[0]);
  });

  test('no email reaches an address without an account, a known one gets the reset email', async ({
    page,
  }, testInfo) => {
    const known = await newUser(page, testInfo);
    const unknown = `unknown-${uniqueEmail(testInfo, 'qa89b')}`;

    await page.goto('/forgot-password');
    await requestReset(page, unknown);
    await expect(heading(page)).toHaveText(copy.sentTitle);
    await page.goto('/forgot-password');
    await requestReset(page, known);
    await expect(heading(page)).toHaveText(copy.sentTitle);

    // The known address's reset email arriving means the worker has drained the queue past both.
    await expect
      .poll(async () => (await latestMessageTo(known)).text.includes(RESET_LINK), {
        timeout: 15_000,
      })
      .toBe(true);
    await expect(latestMessageTo(unknown, { timeoutMs: 3_000 })).rejects.toThrow(
      /No Mailpit message/,
    );
  });

  test('a limit refused on the first request shows the translated message on the form', async ({
    page,
  }) => {
    await limitRoute(page);
    await page.goto('/forgot-password');

    await requestReset(page, 'minh.anh@example.test');

    await expect(heading(page)).toHaveText(copy.title);
    await expect(page.getByRole('alert')).toHaveText(copy.errors.RESEND_LIMIT);
    await expect(page.getByTestId('forgot-password-sent')).toHaveCount(0);
  });

  test('the countdown reaches "Gửi lại sau 1 giây" and then "Gửi lại"', async ({ page }) => {
    await page.clock.install();
    await page.route(REQUEST_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
    );
    await page.goto('/forgot-password');
    await requestReset(page, 'minh.anh@example.test');
    await expect(resend(page)).toHaveText('Gửi lại sau 60 giây');

    await page.clock.runFor(59_000);
    await expect(resend(page)).toHaveText('Gửi lại sau 1 giây');
    await expect(resend(page)).toBeDisabled();
    await page.clock.runFor(1_000);
    await expect(resend(page)).toHaveText(copy.resend);
    await expect(resend(page)).toBeEnabled();
  });
});

test.describe('forgot password QA (en)', () => {
  test.use({ locale: 'en-US' });
  const copy = en.auth.forgotPassword;

  async function toEnglish(page: Page, path = '/forgot-password') {
    await page.goto(path);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(heading(page)).toHaveText(copy.title);
  }

  test('an invalid email shows the English field error and sends nothing', async ({ page }) => {
    let requests = 0;
    await page.route(REQUEST_ROUTE, (route) => {
      requests += 1;
      return route.continue();
    });
    await toEnglish(page);

    await emailField(page).fill('minh.anh@');
    await submit(page).click();

    await expect(page.getByText(copy.errors.EMAIL_INVALID)).toBeVisible();
    await expect(emailField(page)).toBeFocused();
    expect(requests).toBe(0);
  });

  test('a limit refused on the first request shows the English message', async ({ page }) => {
    await limitRoute(page);
    await toEnglish(page);

    await requestReset(page, 'minh.anh@example.test');

    await expect(page.getByRole('alert')).toHaveText(copy.errors.RESEND_LIMIT);
  });

  test('the countdown reads "Send again in 1 second" and then "Send again"', async ({ page }) => {
    await page.clock.install();
    await page.route(REQUEST_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
    );
    await toEnglish(page);
    await requestReset(page, 'minh.anh@example.test');
    await expect(heading(page)).toHaveText(copy.sentTitle);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.sentSubtitle);
    await expect(page.getByTestId('forgot-password-back')).toHaveText(copy.backToSignIn);
    await expect(resend(page)).toHaveText('Send again in 60 seconds');

    await page.clock.runFor(59_000);
    await expect(resend(page)).toHaveText('Send again in 1 second');
    await page.clock.runFor(1_000);
    await expect(resend(page)).toHaveText(copy.resend);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`EN REC-01 and REC-02 at 1440 px and 360 px (${scheme})`, async ({ page }, testInfo) => {
      await page.route(REQUEST_ROUTE, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
      );
      await page.emulateMedia({ colorScheme: scheme });

      for (const width of [1440, 360]) {
        await page.setViewportSize({ width, height: width === 360 ? 800 : 900 });
        // The language choice is kept across loads once English is picked.
        await page.goto('/forgot-password?email=minh.anh%40example.com');
        if ((await heading(page).textContent()) !== copy.title) {
          await page.getByRole('button', { name: 'English' }).click();
        }
        await expect(heading(page)).toHaveText(copy.title);
        await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.subtitle);
        await expect(submit(page)).toHaveText(copy.submit);
        await expect(page.getByTestId('forgot-password-sign-in-link')).toHaveText(
          copy.backToSignIn,
        );
        let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: testInfo.outputPath(`rec-01-en-${width}-${scheme}.png`),
          fullPage: true,
        });

        await submit(page).click();
        await expect(heading(page)).toHaveText(copy.sentTitle);
        await expect(page.getByRole('status')).toHaveText(copy.sentNotice);
        await page.mouse.move(0, 0);
        scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: testInfo.outputPath(`rec-02-en-${width}-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  }
});
