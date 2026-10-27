// Issue #116: the account menu (design "02 · App shell", Example · Account menu open, plus the
// "Ngôn ngữ" group of decisions §12) against the real API and the Compose Postgres. Users are
// synthetic and unique per test; each signs up through `support/session.ts` with one workspace.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

// The password `signInAsNewUser` gives every account.
const password = 'qa-Password-e2e!';
const menuVi = vi.shell.accountMenu;
const menuEn = en.shell.accountMenu;
const NAME = 'Minh Anh';

const trigger = (page: Page) => page.getByTestId('account-menu-trigger');
const menu = (page: Page) => page.getByRole('menu');

/** Signs a fresh user in as "Minh Anh" with one workspace named `workspace`, on /jobs. */
async function signInMember(page: Page, email: string, workspace: string): Promise<void> {
  await signInAsNewUser(page, email);
  psql(`update "user" set name = ${sqlString(NAME)} where email = ${sqlString(email)}`);
  await createWorkspace(page, workspace);
  await page.goto('/jobs');
  await expect(trigger(page)).toBeVisible();
}

test.describe('account menu', () => {
  // A Vietnamese browser, so the app opens in Vietnamese unless the account says otherwise.
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('opens upward from the footer with every option, and works from the keyboard', async ({
    page,
  }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116-keys'), 'An Nhiên');

    await expect(trigger(page)).toHaveAccessibleName(`Tài khoản của ${NAME}`);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();

    const panel = await menu(page).boundingBox();
    const button = await trigger(page).boundingBox();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(button!.y);

    const expected = [
      menuVi.personalSettings,
      menuVi.themeSystem,
      menuVi.themeLight,
      menuVi.themeDark,
      menuVi.languageVi,
      menuVi.languageEn,
      menuVi.signOut,
    ];
    for (const [index, label] of expected.entries()) {
      await expect(page.locator(':focus')).toHaveText(label);
      if (index < expected.length - 1) await page.keyboard.press('ArrowDown');
    }
    await expect(menu(page).getByRole('menuitemradio', { checked: true })).toHaveText([
      menuVi.themeSystem,
      menuVi.languageVi,
    ]);

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test('applies the dark theme', async ({ page }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116-theme'), 'An Nhiên');

    await trigger(page).click();
    await menu(page).getByRole('menuitemradio', { name: menuVi.themeDark }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await trigger(page).click();
    await expect(menu(page).getByRole('menuitemradio', { name: menuVi.themeDark })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('keeps English on the account across sign-out and a fresh browser', async ({
    page,
    browser,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa116-lang');
    await signInMember(page, email, 'An Nhiên');

    await trigger(page).click();
    const saved = page.waitForResponse((response) => response.url().endsWith('/auth/update-user'));
    await menu(page).getByRole('menuitemradio', { name: menuVi.languageEn }).click();
    expect((await saved).status()).toBe(200);
    await expect(menu(page).getByTestId('account-menu-heading')).toHaveText(menuEn.heading);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await menu(page).getByRole('menuitem', { name: menuEn.signOut }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    const fresh = await browser.newContext({
      locale: 'vi-VN',
      viewport: { width: 1440, height: 900 },
    });
    try {
      const other = await fresh.newPage();
      await other.goto('/sign-in');
      await expect(other.locator('html')).toHaveAttribute('lang', 'vi');
      await other.getByTestId('sign-in-email').fill(email);
      await other.getByTestId('sign-in-password').fill(password);
      await other.getByTestId('sign-in-submit').click();
      await expect(other).toHaveURL(/\/jobs/);
      await expect(other.locator('html')).toHaveAttribute('lang', 'en');
      await expect(other.getByRole('navigation', { name: en.shell.nav.label })).toBeVisible();
      await expect(other.getByTestId('account-menu-trigger')).toHaveAccessibleName(
        menuEn.trigger.replace('{name}', NAME),
      );
    } finally {
      await fresh.close();
    }
  });

  test('signs out to /sign-in and leaves nothing of the workspace behind', async ({
    page,
  }, testInfo) => {
    const workspace = `Mây Studio ${Date.now().toString(36)}`;
    await signInMember(page, uniqueEmail(testInfo, 'qa116-out'), workspace);
    // The sidebar does not name the workspace until the workspace menu lands; the user row does
    // show the user, which must be gone after sign-out too.
    await expect(page.getByTestId('app-sidebar-user-name')).toHaveText(NAME);

    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: menuVi.signOut }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs$/);
    await expect(page.getByText(workspace)).toHaveCount(0);
    await expect(page.getByText(NAME)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(workspace)).toHaveCount(0);
    await expect(page.getByTestId('app-layout')).toHaveCount(0);
  });
});
