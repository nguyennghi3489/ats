// Issue #99: the set-new-password (REC-03), reset-done (REC-04) and invalid-link (REC-05) pages,
// driven through the real API and the email worker: the reset link is read from Mailpit.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { addWorkspaceFor, psql, sqlString, uniqueEmail } from './support/session';

const copy = vi.auth.resetPassword;
const oldPassword = 'qa99-Old-Password!';
const newPassword = 'qa99-New-Pass';

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const newField = (page: Page) => page.getByTestId('reset-password-new');
const confirmField = (page: Page) => page.getByTestId('reset-password-confirm');
const submit = (page: Page) => page.getByTestId('reset-password-submit');

/** A verified synthetic user with `oldPassword`, created through the API. */
async function createUser(page: Page, email: string): Promise<void> {
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'QA Tester', email, password: oldPassword, locale: 'vi' },
  });
  expect(signUp.ok()).toBe(true);
  psql(`update "user" set email_verified = true where email = ${sqlString(email)}`);
}

const RESET_LINK = /https?:\/\/[^\s"'<>]+\/api\/auth\/reset-password\/[^\s"'<>]+/;

/** Requests a reset for `email` and returns the link from the email Mailpit received. */
async function requestResetLink(page: Page, email: string): Promise<string> {
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
  return link;
}

test.describe('reset password pages', () => {
  test.use({ locale: 'vi-VN' });

  test('a reset from the emailed link sets the new password, then the link no longer works', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa99');
    await createUser(page, email);
    // A member of one workspace, so signing in with the new password lands on `/` (#107).
    await page.goto('/sign-in');
    await addWorkspaceFor(page, email, oldPassword);
    const link = await requestResetLink(page, email);

    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password\?token=[^&]+$/);
    await expect(heading(page)).toHaveText(copy.title);
    await expect(submit(page)).toBeDisabled();

    await newField(page).fill(newPassword);
    await confirmField(page).fill(`${newPassword}x`);
    await expect(page.getByText(copy.errors.PASSWORD_MISMATCH)).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await confirmField(page).fill(newPassword);
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();

    await expect(heading(page)).toHaveText(copy.done.title);
    await expect(page.getByTestId('reset-password-done-notice')).toHaveText(copy.done.notice);
    await page.screenshot({ path: testInfo.outputPath('rec-04.png'), fullPage: true });
    await page.getByTestId('reset-password-sign-in').click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(newPassword);
    await page.getByTestId('sign-in-submit').click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('placeholder-page')).toBeVisible();

    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password\/invalid$/);
    await expect(heading(page)).toHaveText(copy.invalid.title);
    await expect(page.getByTestId('reset-password-invalid-notice')).toHaveText(copy.invalid.notice);
    await page.screenshot({ path: testInfo.outputPath('rec-05.png'), fullPage: true });
    await page.getByRole('button', { name: copy.invalid.requestNew }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test('/reset-password without a token opens the invalid page', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page).toHaveURL(/\/reset-password\/invalid$/);
    await expect(heading(page)).toHaveText(copy.invalid.title);
    await expect(page.getByRole('link', { name: copy.invalid.backToSignIn })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  test('a 7-character password shows the length error and keeps the button disabled', async ({
    page,
  }) => {
    await page.goto('/reset-password?token=qa99-not-checked-before-submit');

    await newField(page).fill('1234567');
    await confirmField(page).fill('1234567');

    await expect(page.getByText(copy.errors.PASSWORD_TOO_SHORT)).toBeVisible();
    await expect(submit(page)).toBeDisabled();
  });

  test('a token the API refuses on submit opens the invalid page', async ({ page }) => {
    await page.goto('/reset-password?token=qa99-unknown-token');

    await newField(page).fill(newPassword);
    await confirmField(page).fill(newPassword);
    await submit(page).click();

    await expect(page).toHaveURL(/\/reset-password\/invalid$/);
  });

  test('shows the English copy when the language is EN', async ({ page }) => {
    const copyEn = en.auth.resetPassword;
    await page.goto('/reset-password?token=qa99-en');
    await page.getByRole('button', { name: vi.auth.layout.enName }).click();

    await expect(heading(page)).toHaveText(copyEn.title);
    await expect(page.getByLabel(copyEn.newPassword, { exact: true })).toBeVisible();
    await expect(page.getByLabel(copyEn.confirmPassword, { exact: true })).toBeVisible();
    await expect(submit(page)).toHaveText(copyEn.submit);

    await page.goto('/reset-password/invalid');
    await expect(heading(page)).toHaveText(copyEn.invalid.title);
    await expect(page.getByTestId('reset-password-invalid-notice')).toHaveText(
      copyEn.invalid.notice,
    );
  });
});
