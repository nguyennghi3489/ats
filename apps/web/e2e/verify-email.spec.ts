// Issue #86: the check-email page at /verify-email (design AUTH-03, and AUTH-04 after a resend).
// One test signs up through the real API; the resend outcomes the API only gives after a minute or
// five sends (success after the wait, RESEND_TOO_SOON with 42 s, RESEND_LIMIT) are mocked with
// `page.route`, and the 60 s wait is skipped with Playwright's clock.
import { expect, test, type Page } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { uniqueEmail } from './support/session';

const copy = vi.auth.checkEmail;
const RESEND_PATH = '**/api/auth/send-verification-email';

const pageFor = (email: string) => `/verify-email?email=${encodeURIComponent(email)}`;
const resendButton = (page: Page) => page.getByTestId('check-email-resend');
const notice = (page: Page) => page.getByTestId('check-email-notice');

/** Answers the resend call with `status` and `body`; returns how many calls were answered. */
async function mockResend(page: Page, status: number, body: unknown): Promise<() => number> {
  let calls = 0;
  await page.route(RESEND_PATH, async (route) => {
    calls += 1;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return () => calls;
}

/** Opens the page with a fake clock and runs the first 60 s wait out. */
async function openReady(page: Page, email: string): Promise<void> {
  await page.clock.install();
  await page.goto(pageFor(email));
  await expect(resendButton(page)).toBeDisabled();
  await page.clock.runFor(60_000);
  await expect(resendButton(page)).toBeEnabled();
}

test.describe('check-email page', () => {
  test.use({ locale: 'vi-VN' });

  test('after a sign-up shows the address and the resend button disabled with a countdown', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa86');
    const signUp = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'QA Tester', email, password: 'qa86-Password!', locale: 'vi' },
    });
    expect(signUp.ok()).toBe(true);

    await page.goto(pageFor(email));

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
    await expect(page.getByLabel(copy.recipient)).toHaveValue(email);
    await expect(page.getByLabel(copy.recipient)).toHaveAttribute('readonly', '');
    await expect(notice(page)).toContainText(copy.notice);
    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText(/^Gửi lại sau \d+ giây$/);
    await expect(page.getByRole('link', { name: copy.backToSignUp })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  test('a resend after the wait asks the real API, which refuses one within 60 s of sign-up', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa86-real');
    const signUp = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'QA Tester', email, password: 'qa86-Password!', locale: 'vi' },
    });
    expect(signUp.ok()).toBe(true);
    await openReady(page, email);

    const response = page.waitForResponse(RESEND_PATH);
    await resendButton(page).click();
    expect((await response).status()).toBe(429);

    await expect(notice(page)).toContainText(vi.errors.RESEND_TOO_SOON);
    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText(/^Gửi lại sau \d+ giây$/);
  });

  test('after 60 s the button enables; a resend shows AUTH-04 and restarts the wait', async ({
    page,
  }, testInfo) => {
    const calls = await mockResend(page, 200, { status: true });
    await openReady(page, uniqueEmail(testInfo, 'qa86-ok'));

    await resendButton(page).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.resentTitle);
    await expect(notice(page)).toContainText(copy.resentNotice);
    await expect(page.getByText(copy.resentFooter)).toBeVisible();
    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText('Gửi lại sau 60 giây');
    expect(calls()).toBe(1);
  });

  test('RESEND_TOO_SOON with retryAfterSeconds 42 disables the button with a 42 s countdown', async ({
    page,
  }, testInfo) => {
    await mockResend(page, 429, { code: 'RESEND_TOO_SOON', retryAfterSeconds: 42 });
    await openReady(page, uniqueEmail(testInfo, 'qa86-soon'));

    await resendButton(page).click();

    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText('Gửi lại sau 42 giây');
  });

  test('RESEND_LIMIT shows the translated limit message and the button stays disabled', async ({
    page,
  }, testInfo) => {
    await mockResend(page, 429, { code: 'RESEND_LIMIT', retryAfterSeconds: 3_300 });
    await openReady(page, uniqueEmail(testInfo, 'qa86-limit'));

    await resendButton(page).click();

    await expect(page.getByRole('alert')).toContainText(vi.errors.RESEND_LIMIT);
    await expect(resendButton(page)).toBeDisabled();
    await page.clock.runFor(10 * 60_000);
    await expect(resendButton(page)).toBeDisabled();
  });

  test('without an email it goes to /sign-up', async ({ page }) => {
    await page.goto('/verify-email');

    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('the countdown is announced politely, not every second', async ({ page }, testInfo) => {
    await page.clock.install();
    await page.goto(pageFor(uniqueEmail(testInfo, 'qa86-live')));
    const live = page.getByTestId('check-email-countdown-status');

    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveText('Bạn có thể gửi lại email sau 60 giây.');
    await page.clock.runFor(5_000);
    await expect(resendButton(page)).toHaveText('Gửi lại sau 55 giây');
    await expect(live).toHaveText('Bạn có thể gửi lại email sau 60 giây.');
    await page.clock.runFor(55_000);
    await expect(live).toHaveText(copy.readyAnnouncement);
  });

  test('switches to English', async ({ page }, testInfo) => {
    await page.goto(pageFor(uniqueEmail(testInfo, 'qa86-en')));

    await page.getByRole('button', { name: vi.auth.layout.enName, exact: true }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.checkEmail.title);
    await expect(page.getByLabel(en.auth.checkEmail.recipient)).toBeVisible();
  });

  for (const width of [1440, 360]) {
    test(`fits a ${width} px viewport in light and dark`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(pageFor(uniqueEmail(testInfo, `qa86-${width}`)));

      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const card = page.locator('.auth-layout__card');
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeLessThanOrEqual(Math.min(448, width));
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        const resend = await resendButton(page).boundingBox();
        expect(resend!.x + resend!.width).toBeLessThanOrEqual(box!.x + box!.width);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      }
    });
  }
});
