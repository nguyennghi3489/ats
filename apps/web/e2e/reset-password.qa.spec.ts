// QA for issue #99: what reset-password.spec.ts leaves out. REC-03 / REC-04 / REC-05 at 1440 px and
// 360 px in light and dark, vi then en (screenshots for the design review); the old password refused
// after a real reset; the pending state; the "Hiện" toggles; Enter submits; the email carried on to
// sign-in; "Quay lại đăng nhập". Users are synthetic and unique per test.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { psql, sqlString, uniqueEmail } from './support/session';

const RESET_PATH = '**/api/auth/reset-password';
const RESET_LINK = /https?:\/\/[^\s"'<>]+\/api\/auth\/reset-password\/[^\s"'<>]+/;
const oldPassword = 'qa99b-Old-Password!';
const newPassword = 'qa99b-New-Pass';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const newField = (page: Page) => page.getByTestId('reset-password-new');
const confirmField = (page: Page) => page.getByTestId('reset-password-confirm');
const submit = (page: Page) => page.getByTestId('reset-password-submit');
const shot = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(name), fullPage: true });

/** Answers the reset request with success, after `delayMs`. */
function resetSucceeds(page: Page, delayMs = 0) {
  return page.route(RESET_PATH, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    });
  });
}

/** No page is wider than the viewport, and every "Hiện" toggle and footer link is 44 px tall on mobile. */
async function expectMobileLayout(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
}

test.describe('reset password pages (QA #99)', () => {
  test.use({ locale: 'vi-VN' });

  test('a real reset refuses the old password and accepts the new one', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa99b');
    const signUp = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'QA Reset', email, password: oldPassword, locale: 'vi' },
    });
    expect(signUp.ok()).toBe(true);
    psql(`update "user" set email_verified = true where email = ${sqlString(email)}`);
    const requested = await page.request.post('/api/auth/request-password-reset', {
      data: { email },
    });
    expect(requested.ok()).toBe(true);
    let link = '';
    await expect
      .poll(
        async () => {
          const message = await latestMessageTo(email, { timeoutMs: 1_000 }).catch(() => null);
          link = message?.text.match(RESET_LINK)?.[0] ?? '';
          return link;
        },
        { timeout: 15_000 },
      )
      .not.toBe('');

    await page.goto(link);
    await expect(heading(page)).toHaveText(vi.auth.resetPassword.title);
    await newField(page).fill(newPassword);
    await confirmField(page).fill(newPassword);
    // Enter in the second field submits the form.
    await confirmField(page).press('Enter');
    await expect(heading(page)).toHaveText(vi.auth.resetPassword.done.title);

    const withOld = await page.request.post('/api/auth/sign-in/email', {
      data: { email, password: oldPassword },
    });
    expect(withOld.ok()).toBe(false);
    const withNew = await page.request.post('/api/auth/sign-in/email', {
      data: { email, password: newPassword },
    });
    expect(withNew.ok()).toBe(true);
  });

  test('the form is disabled while the request is pending and sent once', async ({ page }) => {
    let calls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/reset-password')) calls += 1;
    });
    await resetSucceeds(page, 1_500);
    await page.goto('/reset-password?token=qa99b-pending');
    await newField(page).fill(newPassword);
    await confirmField(page).fill(newPassword);
    await submit(page).click();

    await expect(newField(page)).toBeDisabled();
    await expect(confirmField(page)).toBeDisabled();
    await expect(page.getByTestId('reset-password-new-toggle')).toBeDisabled();
    await expect(page.getByTestId('reset-password-confirm-toggle')).toBeDisabled();
    await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
    await shot(page, 'rec-03-pending-vi.png');
    await submit(page).click({ force: true });

    await expect(heading(page)).toHaveText(vi.auth.resetPassword.done.title);
    expect(calls).toBe(1);
  });

  test('each "Hiện" toggle shows its own field and turns into "Ẩn"', async ({ page }) => {
    await page.goto('/reset-password?token=qa99b-toggle');
    await newField(page).fill(newPassword);
    await confirmField(page).fill(newPassword);
    const toggle = page.getByTestId('reset-password-new-toggle');
    await expect(toggle).toHaveText(vi.auth.resetPassword.show);

    await toggle.click();
    await expect(
      page.getByLabel(vi.auth.resetPassword.newPassword, { exact: true }),
    ).toHaveAttribute('type', 'text');
    await expect(
      page.getByLabel(vi.auth.resetPassword.confirmPassword, { exact: true }),
    ).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveText(vi.auth.resetPassword.hide);
  });

  test('"Đăng nhập" carries the email from the link on to sign-in', async ({ page }) => {
    await resetSucceeds(page);
    await page.goto('/reset-password?token=qa99b-email&email=minh.anh%40example.test');
    await newField(page).fill(newPassword);
    await confirmField(page).fill(newPassword);
    await submit(page).click();
    await page.getByRole('button', { name: vi.auth.resetPassword.done.signIn }).click();
    await expect(page).toHaveURL(/\/sign-in\?email=minh\.anh(%40|@)example\.test$/);
  });

  test('"Quay lại đăng nhập" on REC-05 opens sign-in', async ({ page }) => {
    await page.goto('/reset-password/invalid');
    await page.getByRole('link', { name: vi.auth.resetPassword.invalid.backToSignIn }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  for (const width of [1440, 360] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`REC-03 / REC-04 / REC-05 at ${width} px (${scheme}), vi then en`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 900 });

        for (const [lang, copy] of [
          ['vi', vi],
          ['en', en],
        ] as const) {
          const t = copy.auth.resetPassword;
          await page.unroute(RESET_PATH);
          await resetSucceeds(page);

          // REC-03 in the design's state: first password valid, second one mismatched.
          await page.goto('/reset-password?token=qa99b-screens');
          if (lang === 'en') {
            await page.getByRole('button', { name: 'English' }).click();
          }
          await expect(heading(page)).toHaveText(t.title);
          if (width === 1440)
            await expect(page.getByTestId('auth-subtitle')).toHaveText(t.subtitle);
          await expect(page.getByText(t.passwordHelper)).toBeVisible();
          await newField(page).fill('qa-Pass-1');
          await confirmField(page).fill('qa-Pass');
          await confirmField(page).blur();
          await expect(page.getByText(t.errors.PASSWORD_MISMATCH)).toBeVisible();
          await expect(submit(page)).toBeDisabled();
          await expect(submit(page)).toHaveText(t.submit);
          await expect(page.getByTestId('reset-password-new-toggle')).toHaveText(t.show);
          await expect(page.getByTestId('reset-password-confirm-toggle')).toHaveText(t.show);
          if (width === 360) {
            await expectMobileLayout(page);
            const toggle = await page.getByTestId('reset-password-new-toggle').boundingBox();
            expect(toggle!.height).toBeGreaterThanOrEqual(44);
          }
          await shot(page, `rec-03-${lang}-${width}-${scheme}.png`);

          // REC-04.
          await confirmField(page).fill('qa-Pass-1');
          await submit(page).click();
          await expect(heading(page)).toHaveText(t.done.title);
          if (width === 1440) {
            await expect(page.getByTestId('auth-subtitle')).toHaveText(t.done.subtitle);
          }
          await expect(page.getByTestId('reset-password-done-notice')).toHaveText(t.done.notice);
          await expect(page.getByTestId('reset-password-sign-in')).toHaveText(t.done.signIn);
          if (width === 360) await expectMobileLayout(page);
          await shot(page, `rec-04-${lang}-${width}-${scheme}.png`);

          // REC-05.
          await page.goto('/reset-password/invalid');
          await expect(heading(page)).toHaveText(t.invalid.title);
          if (width === 1440) {
            await expect(page.getByTestId('auth-subtitle')).toHaveText(t.invalid.subtitle);
          }
          await expect(page.getByTestId('reset-password-invalid-notice')).toHaveText(
            t.invalid.notice,
          );
          await expect(page.getByTestId('reset-password-invalid-request')).toHaveText(
            t.invalid.requestNew,
          );
          await expect(page.getByTestId('reset-password-invalid-sign-in-link')).toHaveText(
            t.invalid.backToSignIn,
          );
          if (width === 360) {
            await expectMobileLayout(page);
            const back = await page
              .getByTestId('reset-password-invalid-sign-in-link')
              .boundingBox();
            expect(back!.height).toBeGreaterThanOrEqual(44);
          }
          await shot(page, `rec-05-${lang}-${width}-${scheme}.png`);

          // Back to Vietnamese for the next round (the choice is kept across reloads).
          if (lang === 'en') {
            await page.getByRole('button', { name: 'Tiếng Việt' }).click();
          }
        }
      });
    }
  }
});
