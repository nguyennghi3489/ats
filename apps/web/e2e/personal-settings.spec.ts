// Issue #121: personal settings at /settings/personal against the real API and the Compose Postgres.
// Each test signs a fresh synthetic user up (support/session.ts) with a workspace, so the page opens
// inside the app layout with the sidebar user row.
import { type Browser, expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewMember, sqlString, uniqueEmail } from './support/session';

const copy = vi.settings.personal;
/** The password support/session.ts signs every new user up with. */
const password = 'qa-Password-e2e!';

async function openSettings(page: Page, email: string): Promise<void> {
  await signInAsNewMember(page, email);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  await page.goto('/settings/personal');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
}

const nameField = (page: Page) => page.getByTestId('personal-settings-name');
const sidebarName = (page: Page) => page.getByTestId('app-sidebar-user-name');

/** Signs `email` in through the sign-in form in a brand-new browser context. */
async function signInFresh(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
  await expect(page).toHaveURL(/\/jobs$/);
  return page;
}

test.describe('personal settings', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('shows the current name, the email read-only and one h1', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa121-show');
    await openSettings(page, email);

    await expect(nameField(page)).toHaveValue('Minh Anh');
    await expect(page.getByTestId('personal-settings-email')).toHaveValue(email);
    await expect(page.getByTestId('personal-settings-email')).toHaveAttribute('readonly', '');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByLabel(copy.profile.name)).toBeVisible();
    await expect(page.getByLabel(copy.language.vi)).toBeChecked();
  });

  test('a saved name shows in the sidebar at once and survives a reload', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-name'));
    await expect(sidebarName(page)).toHaveText('Minh Anh');

    await nameField(page).fill('  Trần Thu Hà  ');
    await page.getByTestId('personal-settings-save-name').click();

    await expect(page.getByTestId('personal-settings-profile-saved')).toHaveText(
      copy.profile.saved,
    );
    await expect(sidebarName(page)).toHaveText('Trần Thu Hà');

    await page.reload();
    await expect(nameField(page)).toHaveValue('Trần Thu Hà');
    await expect(sidebarName(page)).toHaveText('Trần Thu Hà');
  });

  test('a blank name is refused on the field', async ({ page }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-blank'));

    await nameField(page).fill('   ');
    await page.getByTestId('personal-settings-save-name').click();

    await expect(page.getByText(copy.profile.errors.NAME_REQUIRED)).toBeVisible();
    await expect(nameField(page)).toBeFocused();
    await page.reload();
    await expect(nameField(page)).toHaveValue('Minh Anh');
  });

  test('English is saved on the account and applies after signing in again elsewhere', async ({
    page,
    browser,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa121-locale');
    await openSettings(page, email);

    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/update-user') && response.request().method() === 'POST',
    );
    await page.getByLabel(copy.language.en).check();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.settings.personal.title);
    expect((await saved).status()).toBe(200);

    const fresh = await signInFresh(browser, email);
    await fresh.goto('/settings/personal');
    await expect(fresh.getByRole('heading', { level: 1 })).toHaveText(en.settings.personal.title);
    await expect(fresh.locator('html')).toHaveAttribute('lang', 'en');
    await fresh.context().close();
  });

  test('"Tối" switches the page to the dark theme at once, by keyboard too', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-theme'));
    await expect(page.getByText(copy.theme.helper)).toBeVisible();

    await page.getByLabel(copy.theme.dark).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByLabel(copy.theme.light).focus();
    await page.getByLabel(copy.theme.light).press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('fits a 360 px screen without horizontal scrolling', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openSettings(page, uniqueEmail(testInfo, 'qa121-mobile'));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(nameField(page)).toBeVisible();
    await expect(page.getByTestId('personal-settings-save-name')).toBeVisible();
  });
});
