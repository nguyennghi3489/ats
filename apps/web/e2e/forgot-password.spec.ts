// Issue #89: the forgot-password screen (design REC-01 request form, REC-02 check email) against the
// real API, the email worker and Mailpit. Users are synthetic and unique per test; they are created
// through the app's own auth client and marked verified with psql. Addresses without an account are
// unique too, so the per-address request limits (60 s, 5 per hour) never carry over between runs.
// The limit message is answered by a mocked route, because the real limit needs five requests.
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { psql, sqlString, uniqueEmail } from './support/session';

const password = 'qa-Password-89!';
const copy = vi.auth.forgotPassword;
const REQUEST_ROUTE = '**/api/auth/request-password-reset';

/** Creates a verified account for a unique address through the app's auth client. */
async function newUser(page: Page, testInfo: TestInfo): Promise<string> {
  const email = uniqueEmail(testInfo, 'qa89');
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
  await emailField(page).fill(email);
  await submit(page).click();
}

const RESET_LINK = '/api/auth/reset-password/';

/**
 * Waits until the newest message to `email` is a reset email other than `previousId`, and returns
 * its id. The sign-up verification email reaches the same address first.
 */
async function newResetEmail(email: string, previousId?: string): Promise<string> {
  let id = '';
  await expect
    .poll(
      async () => {
        const message = await latestMessageTo(email);
        id = message.id;
        return message.text.includes(RESET_LINK) && message.id !== previousId;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return id;
}

/** The visible REC-02 content, to compare the answer for two addresses. */
async function sentState(page: Page) {
  await expect(heading(page)).toHaveText(copy.sentTitle);
  return {
    title: await heading(page).textContent(),
    subtitle: await page.getByTestId('auth-subtitle').textContent(),
    notice: await page.getByTestId('forgot-password-sent-notice').textContent(),
    back: await page.getByTestId('forgot-password-back').textContent(),
    resend: await resend(page).textContent(),
    url: page.url(),
  };
}

test.describe('forgot password', () => {
  // A Vietnamese browser, so the page opens in Vietnamese; the EN test switches explicitly.
  test.use({ locale: 'vi-VN' });

  test('"Quên mật khẩu?" opens REC-01 with the typed email filled in', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByTestId('sign-in-email').fill('minh.anh@example.test');

    await page.getByRole('link', { name: vi.auth.signIn.forgotPassword }).click();

    await expect(page).toHaveURL(/\/forgot-password\?email=minh\.anh%40example\.test$/);
    await expect(heading(page)).toHaveText(copy.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.subtitle);
    await expect(emailField(page)).toHaveValue('minh.anh@example.test');
    await expect(submit(page)).toHaveText(copy.submit);
    await expect(page.getByRole('link', { name: copy.backToSignIn })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  test('a verified user gets REC-02 and a reset email in Mailpit', async ({ page }, testInfo) => {
    const email = await newUser(page, testInfo);
    await page.goto('/forgot-password');

    await requestReset(page, email);

    await expect(heading(page)).toHaveText(copy.sentTitle);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.sentSubtitle);
    await expect(page.getByRole('status')).toHaveText(copy.sentNotice);
    await expect(resend(page)).toBeDisabled();
    await newResetEmail(email);

    await page.getByTestId('forgot-password-back').click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('an address without an account gets the identical REC-02 state', async ({
    page,
  }, testInfo) => {
    const known = await newUser(page, testInfo);
    await page.goto('/forgot-password');
    await requestReset(page, known);
    const knownState = await sentState(page);

    await page.goto('/forgot-password');
    await requestReset(page, `unknown-${uniqueEmail(testInfo, 'qa89')}`);

    expect(await sentState(page)).toEqual(knownState);
  });

  // Real time, not a faked page clock: the API refuses a second request within 60 s of the first.
  test('"Gửi lại" waits 60 s with a countdown, then sends again', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const email = await newUser(page, testInfo);
    await page.goto('/forgot-password');
    await requestReset(page, email);
    const first = await newResetEmail(email);

    await expect(resend(page)).toBeDisabled();
    await expect(resend(page)).toHaveText(/^Gửi lại sau (60|59|58) giây$/);
    await expect(resend(page)).toHaveText('Gửi lại sau 50 giây', { timeout: 15_000 });
    await expect(resend(page)).toBeDisabled();
    await expect(resend(page)).toBeEnabled({ timeout: 60_000 });
    await expect(resend(page)).toHaveText(copy.resend);

    const resent = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/request-password-reset'),
    );
    await resend(page).click();
    expect((await resent).status()).toBe(200);

    await expect(resend(page)).toHaveText('Gửi lại sau 60 giây');
    await newResetEmail(email, first);
  });

  test('a refused resend shows the translated limit message', async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await page.route(REQUEST_ROUTE, (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' })
        : route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: { 'Retry-After': '1800' },
            body: JSON.stringify({
              code: 'RESEND_LIMIT',
              message: 'RESEND_LIMIT',
              retryAfterSeconds: 1800,
            }),
          });
    });
    await page.goto('/forgot-password');
    await requestReset(page, 'minh.anh@example.test');
    // The countdown starts once the answer arrives; only then can the clock run past it.
    await expect(resend(page)).toBeDisabled();
    await page.clock.runFor(60_000);
    await expect(resend(page)).toBeEnabled();

    await resend(page).click();

    await expect(page.getByRole('alert')).toHaveText(copy.errors.RESEND_LIMIT);
  });

  test('an invalid email shows the field error and sends nothing', async ({ page }) => {
    let requests = 0;
    await page.route(REQUEST_ROUTE, (route) => {
      requests += 1;
      return route.continue();
    });
    await page.goto('/forgot-password');

    await requestReset(page, 'minh.anh@');

    await expect(page.getByText(copy.errors.EMAIL_INVALID)).toBeVisible();
    await expect(emailField(page)).toBeFocused();
    expect(requests).toBe(0);
  });

  test('has the English copy after switching to EN', async ({ page }) => {
    await page.route(REQUEST_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
    );
    const copyEn = en.auth.forgotPassword;
    await page.goto('/forgot-password');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(heading(page)).toHaveText(copyEn.title);
    await expect(submit(page)).toHaveText(copyEn.submit);

    await requestReset(page, 'minh.anh@example.test');
    await expect(heading(page)).toHaveText(copyEn.sentTitle);
    await expect(page.getByRole('status')).toHaveText(copyEn.sentNotice);
    await expect(resend(page)).toHaveText(/^Send again in \d+ seconds?$/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`matches REC-01 and REC-02 at 1440 px and 360 px (${scheme})`, async ({
      page,
    }, testInfo) => {
      await page.route(REQUEST_ROUTE, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
      );
      await page.emulateMedia({ colorScheme: scheme });

      for (const width of [1440, 360]) {
        await page.setViewportSize({ width, height: width === 360 ? 800 : 900 });
        await page.goto('/forgot-password?email=minh.anh%40example.com');
        await expect(heading(page)).toHaveText(copy.title);
        await page.screenshot({
          path: testInfo.outputPath(`rec-01-${width}-${scheme}.png`),
          fullPage: true,
        });

        await submit(page).click();
        await expect(heading(page)).toHaveText(copy.sentTitle);
        // The pointer stays where "Gửi hướng dẫn" was, over "Quay lại đăng nhập"; no hover in the shot.
        await page.mouse.move(0, 0);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(width);
        if (width === 360) {
          const box = await resend(page).boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({
          path: testInfo.outputPath(`rec-02-${width}-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  }
});
