// QA for issue #87, in a real browser against the real API: the edges the issue spec
// (verify-email-result.spec.ts) does not walk through. AUTH-05 and AUTH-06 copy in vi then en, the
// "Người nhận" prefill and field error without a request, the translated RESEND_LIMIT and
// RESEND_TOO_SOON notices (send-verification-email mocked with page.route, so no spec here depends on
// the Redis resend counters), the back link, and a tampered verification link.
import { expect, type Page, type Request, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { uniqueEmail } from './support/session';

const SEND_PATH = '**/api/auth/send-verification-email';

/** Records every send-verification-email request the page makes. */
function watchSends(page: Page): Request[] {
  const sends: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/send-verification-email')) sends.push(request);
  });
  return sends;
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(name), fullPage: true });

test.describe('verification result pages (QA #87)', () => {
  test.use({ locale: 'vi-VN' });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('AUTH-05 copy in vi then en; the button opens sign-in in both', async ({ page }) => {
    await page.goto('/verify-email/success');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.auth.verified.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(vi.auth.verified.subtitle);
    await expect(page.getByTestId('verified-notice')).toHaveText(vi.auth.verified.notice);
    await expect(page.getByRole('button', { name: vi.auth.verified.signIn })).toBeVisible();
    await shot(page, 'auth-05-vi-1440.png');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.verified.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(en.auth.verified.subtitle);
    await expect(page.getByTestId('verified-notice')).toHaveText(en.auth.verified.notice);
    await shot(page, 'auth-05-en-1440.png');

    await page.getByRole('button', { name: en.auth.verified.signIn }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('AUTH-06 copy in vi then en; "Quay lại đăng nhập" opens sign-in', async ({ page }) => {
    await page.goto('/verify-email/expired');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.auth.linkExpired.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(vi.auth.linkExpired.subtitle);
    await expect(page.getByTestId('link-expired-notice')).toHaveText(vi.auth.linkExpired.notice);
    await expect(page.getByLabel(vi.auth.linkExpired.email)).toHaveAttribute(
      'placeholder',
      'minh.anh@example.com',
    );
    await expect(page.getByRole('button', { name: vi.auth.linkExpired.submit })).toBeVisible();
    await expect(page.getByRole('link', { name: vi.auth.linkExpired.backToSignIn })).toBeVisible();
    await shot(page, 'auth-06-vi-1440.png');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.linkExpired.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(en.auth.linkExpired.subtitle);
    await expect(page.getByTestId('link-expired-notice')).toHaveText(en.auth.linkExpired.notice);
    await expect(page.getByLabel(en.auth.linkExpired.email)).toBeVisible();
    await expect(page.getByRole('button', { name: en.auth.linkExpired.submit })).toBeVisible();
    await shot(page, 'auth-06-en-1440.png');

    await page.getByRole('link', { name: en.auth.linkExpired.backToSignIn }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('the recipient is prefilled from the email query', async ({ page }) => {
    await page.goto('/verify-email/expired?email=minh.anh%40example.test');
    await expect(page.getByLabel(vi.auth.linkExpired.email)).toHaveValue('minh.anh@example.test');
  });

  test('an invalid or empty address shows the field error and sends no request, vi then en', async ({
    page,
  }) => {
    const sends = watchSends(page);
    await page.goto('/verify-email/expired');
    const field = page.getByLabel(vi.auth.linkExpired.email);

    await page.getByRole('button', { name: vi.auth.linkExpired.submit }).click();
    await expect(page.getByText(vi.auth.linkExpired.errors.EMAIL_INVALID)).toBeVisible();

    await field.fill('minh.anh@');
    await field.press('Enter');
    await expect(page.getByText(vi.auth.linkExpired.errors.EMAIL_INVALID)).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await expect(page).toHaveURL(/\/verify-email\/expired$/);
    await shot(page, 'auth-06-invalid-vi-1440.png');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByText(en.auth.linkExpired.errors.EMAIL_INVALID)).toBeVisible();
    await shot(page, 'auth-06-invalid-en-1440.png');

    expect(sends, 'no send-verification-email request for an invalid address').toHaveLength(0);
  });

  for (const [code, seconds] of [
    ['RESEND_LIMIT', 1800],
    ['RESEND_TOO_SOON', 45],
  ] as const) {
    test(`a ${code} answer shows the translated notice in vi then en and stays on the page`, async ({
      page,
    }) => {
      await page.route(SEND_PATH, (route) =>
        route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ code, message: code, retryAfterSeconds: seconds }),
        }),
      );
      const sends = watchSends(page);
      await page.goto('/verify-email/expired');
      await page.getByLabel(vi.auth.linkExpired.email).fill('minh.anh@example.test');
      await page.getByRole('button', { name: vi.auth.linkExpired.submit }).click();

      const notice = page.getByTestId('link-expired-request-error');
      await expect(notice).toHaveText(vi.auth.linkExpired.errors[code]);
      await expect(notice).toHaveAttribute('role', 'alert');
      await expect(page).toHaveURL(/\/verify-email\/expired$/);
      await expect(page.getByLabel(vi.auth.linkExpired.email)).toHaveValue('minh.anh@example.test');
      expect(sends).toHaveLength(1);
      expect(sends[0]!.postDataJSON()).toMatchObject({ email: 'minh.anh@example.test' });
      await shot(page, `auth-06-${code}-vi-1440.png`);

      await page.getByRole('button', { name: 'English' }).click();
      await expect(notice).toHaveText(en.auth.linkExpired.errors[code]);
      await shot(page, `auth-06-${code}-en-1440.png`);
    });
  }

  test('a tampered verification link lands on the expired page', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa87-tamper');
    await page.goto('/sign-up');
    await page.getByTestId('sign-up-name').fill('QA Tamper');
    await page.getByTestId('sign-up-email').fill(email);
    await page.getByTestId('sign-up-password').fill('qa-Password-87!');
    await page.getByTestId('sign-up-submit').click();
    await expect(page).toHaveURL(/\/verify-email\?email=/);

    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    const link = /https?:\/\/\S*\/verify-email\?token=[^\s"'<>)]+/.exec(message.text)?.[0];
    expect(link, 'verification link in the email').toBeTruthy();
    const tampered = link!.replace(/token=([^&]+)/, (_, token: string) => `token=${token}x`);

    await page.goto(tampered);
    await expect(page).toHaveURL(/\/verify-email\/expired$/);
    await expect(page.getByTestId('link-expired-notice')).toHaveText(vi.auth.linkExpired.notice);
  });
});
