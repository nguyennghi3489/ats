// Issue #122: changing the password from personal settings, against the real API and the Compose
// Postgres. A change signs out every other session of the user (decisions §2, like a reset) and
// keeps this one; a wrong current password changes nothing.
import { type Browser, expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { signInAsNewMember, uniqueEmail } from './support/session';

const copy = vi.settings.password;
/** The password `signInAsNewUser` gives every synthetic account. */
const oldPassword = 'qa-Password-e2e!';
const newPassword = 'qa-Changed-e2e-2!';

/** Signs `email` in through the app's auth client; the error code when Better Auth refuses. */
async function signIn(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/sign-in');
  return page.evaluate(
    async ([clientPath, input]) => {
      const { authApi } = (await import(/* @vite-ignore */ clientPath)) as {
        authApi: { signIn: (i: unknown) => Promise<unknown> };
      };
      try {
        await authApi.signIn(input);
        return 'OK';
      } catch (error) {
        return (error as { code?: string }).code ?? 'UNKNOWN';
      }
    },
    ['/src/features/auth/auth-client.ts', { email, password }] as const,
  );
}

/** Whether `password` signs `email` in, tried in a fresh browser context. */
async function signsIn(browser: Browser, email: string, password: string): Promise<string> {
  const context = await browser.newContext();
  try {
    return await signIn(await context.newPage(), email, password);
  } finally {
    await context.close();
  }
}

/** One request through the app's API client, as the next screen would make. */
async function callApi(page: Page): Promise<void> {
  await page.evaluate(async (apiPath) => {
    const { api } = (await import(/* @vite-ignore */ apiPath)) as {
      api: { get: (path: string) => Promise<unknown> };
    };
    await api.get('/me').catch(() => undefined);
  }, '/src/lib/api.ts');
}

async function changePassword(page: Page, current: string, next: string): Promise<void> {
  const section = page.getByTestId('change-password-section');
  await section.getByRole('textbox', { name: copy.current, exact: true }).fill(current);
  await section.getByRole('textbox', { name: copy.new, exact: true }).fill(next);
  await section.getByRole('textbox', { name: copy.confirm, exact: true }).fill(next);
  await section.getByRole('button', { name: copy.submit, exact: true }).click();
}

test.describe('change password (#122)', () => {
  test.use({ locale: 'vi-VN' });

  test('signs the other device out, keeps this one, and only the new password signs in', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa122-change');
    await signInAsNewMember(page, email);
    const other = await browser.newContext({ locale: 'vi-VN' });
    const otherPage = await other.newPage();
    expect(await signIn(otherPage, email, oldPassword)).toBe('OK');
    await otherPage.goto('/settings/personal');
    await expect(otherPage.getByTestId('personal-settings')).toBeVisible();

    await page.goto('/settings/personal');
    await expect(page.getByRole('heading', { level: 2, name: copy.heading })).toBeVisible();
    await changePassword(page, oldPassword, newPassword);

    await expect(page.getByTestId('change-password-done')).toHaveText(copy.changed);
    for (const label of [copy.current, copy.new, copy.confirm]) {
      await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue('');
    }

    // The other device's next API call ends on sign-in with the expired-session notice.
    await callApi(otherPage);
    await expect(otherPage).toHaveURL(/\/sign-in\?.*expired=1/);
    await expect(otherPage.getByText(vi.auth.signIn.expired)).toBeVisible();
    await other.close();

    // This device stays signed in.
    await callApi(page);
    await page.reload();
    await expect(page).toHaveURL(/\/settings\/personal$/);
    await expect(page.getByTestId('personal-settings')).toBeVisible();

    expect(await signsIn(browser, email, newPassword)).toBe('OK');
    expect(await signsIn(browser, email, oldPassword)).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  test('a wrong current password shows on "Mật khẩu hiện tại" and changes nothing', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa122-wrong');
    await signInAsNewMember(page, email);
    await page.goto('/settings/personal');

    await changePassword(page, 'not-the-Password-1', newPassword);

    const current = page.getByRole('textbox', { name: copy.current, exact: true });
    await expect(current).toHaveAttribute('aria-invalid', 'true');
    await expect(current).toHaveAccessibleDescription(copy.errors.INVALID_PASSWORD);
    await expect(current).toBeFocused();
    await expect(page.getByTestId('change-password-done')).toHaveCount(0);

    expect(await signsIn(browser, email, oldPassword)).toBe('OK');
    expect(await signsIn(browser, email, newPassword)).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  test('works by keyboard: Tab through the fields and toggles, Enter submits', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa122-keys');
    await signInAsNewMember(page, email);
    await page.goto('/settings/personal');

    const section = page.getByTestId('change-password-section');
    await section.getByRole('textbox', { name: copy.current, exact: true }).focus();
    await page.keyboard.type(oldPassword);
    await page.keyboard.press('Tab');
    await expect(section.getByRole('button', { name: copy.showCurrent })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(section.getByRole('textbox', { name: copy.new, exact: true })).toBeFocused();
    await page.keyboard.type(newPassword);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(section.getByRole('textbox', { name: copy.confirm, exact: true })).toBeFocused();
    await page.keyboard.type('mismatch-Password');
    await page.keyboard.press('Enter');

    const confirm = section.getByRole('textbox', { name: copy.confirm, exact: true });
    await expect(confirm).toHaveAccessibleDescription(copy.errors.PASSWORD_MISMATCH);
    await expect(confirm).toBeFocused();

    await confirm.fill(newPassword);
    await confirm.press('Enter');
    await expect(page.getByTestId('change-password-done')).toHaveText(copy.changed);
  });
});
