// QA for issue #116 (account menu), on top of account-menu.spec.ts: the panel against "02 · App
// shell", Example · Account menu open, at 1440 px in vi then en and in light then dark (screenshots
// under test-results for the comparison), the panel's geometry (opens upward, left edge on the
// sidebar, sits above the footer), the language save failing in a real browser (UI back to
// Vietnamese, the error in the menu), the personal settings link, Arrow Up / Home / End, and Tab
// leaving the menu. Users are synthetic and unique per test.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const menuVi = vi.shell.accountMenu;
const menuEn = en.shell.accountMenu;
const NAME = 'Minh Anh';

const trigger = (page: Page) => page.getByTestId('account-menu-trigger');
const menu = (page: Page) => page.getByRole('menu');

async function signInMember(page: Page, email: string): Promise<void> {
  await signInAsNewUser(page, email);
  psql(`update "user" set name = ${sqlString(NAME)} where email = ${sqlString(email)}`);
  await createWorkspace(page, 'An Nhiên');
  await page.goto('/jobs');
  await expect(trigger(page)).toBeVisible();
}

/** The visible rows of the open panel, top to bottom, as the user reads them. */
async function panelRows(page: Page): Promise<string[]> {
  const text = await menu(page).innerText();
  return text
    .split('\n')
    .map((line) => line.replace(/^✓\s*/, '').trim())
    .filter(Boolean);
}

test.describe('account menu (QA)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('matches the design in vi then en, light then dark, with the added language group', async ({
    page,
  }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116q-design'));

    // Vietnamese, light (the design frame).
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    expect(await panelRows(page)).toEqual([
      menuVi.heading,
      menuVi.personalSettings,
      menuVi.theme,
      menuVi.themeSystem,
      menuVi.themeLight,
      menuVi.themeDark,
      menuVi.language,
      menuVi.languageVi,
      menuVi.languageEn,
      menuVi.signOut,
    ]);
    await expect(menu(page).getByRole('menuitemradio', { checked: true })).toHaveText([
      menuVi.themeSystem,
      menuVi.languageVi,
    ]);
    // The check is drawn before the chosen option, as in the design.
    const check = await menu(page)
      .getByRole('menuitemradio', { name: menuVi.themeSystem })
      .evaluate((el) => getComputedStyle(el, '::before').content);
    expect(check).toContain('✓');
    await page.screenshot({ path: testInfo.outputPath('account-menu-vi-light.png') });

    // Geometry from the design: the panel opens upward, above the footer user row, its left edge on
    // the sidebar (16 px in), and sign out is red, group labels muted.
    const panel = (await menu(page).boundingBox())!;
    const footer = (await page.getByTestId('app-sidebar-user-name').boundingBox())!;
    expect(panel.y + panel.height).toBeLessThanOrEqual(footer.y);
    expect(panel.x).toBeGreaterThanOrEqual(8);
    expect(panel.x).toBeLessThanOrEqual(24);
    const signOutColor = await menu(page)
      .getByRole('menuitem', { name: menuVi.signOut })
      .evaluate((el) => getComputedStyle(el).color);
    const inkColor = await menu(page)
      .getByRole('menuitemradio', { name: menuVi.themeLight })
      .evaluate((el) => getComputedStyle(el).color);
    expect(signOutColor).not.toBe(inkColor);

    // Vietnamese, dark: the panel follows the theme.
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await trigger(page).click();
    const darkBg = await menu(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.screenshot({ path: testInfo.outputPath('account-menu-vi-dark.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await trigger(page).click();
    const lightBg = await menu(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkBg).not.toBe(lightBg);

    // English.
    await menu(page).getByRole('menuitemradio', { name: menuVi.languageEn }).click();
    await expect(menu(page).getByTestId('account-menu-heading')).toHaveText(menuEn.heading);
    expect(await panelRows(page)).toEqual([
      menuEn.heading,
      menuEn.personalSettings,
      menuEn.theme,
      menuEn.themeSystem,
      menuEn.themeLight,
      menuEn.themeDark,
      menuEn.language,
      menuEn.languageVi,
      menuEn.languageEn,
      menuEn.signOut,
    ]);
    await page.screenshot({ path: testInfo.outputPath('account-menu-en-light.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('account-menu-en-dark.png') });
  });

  test('a failed language save brings Vietnamese back and shows the error in the menu', async ({
    page,
  }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116q-fail'));
    await page.route('**/api/auth/update-user', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"X"}' }),
    );

    await trigger(page).click();
    await menu(page).getByRole('menuitemradio', { name: menuVi.languageEn }).click();

    await expect(menu(page).getByRole('alert')).toHaveText(menuVi.errors.languageFailed);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(menu(page).getByTestId('account-menu-heading')).toHaveText(menuVi.heading);
    await expect(
      menu(page).getByRole('menuitemradio', { name: menuVi.languageVi }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: testInfo.outputPath('account-menu-language-failed.png') });

    // The panel opens upward from the footer; once the error row is added it must still sit above
    // the trigger and the user's name rather than grow down over them.
    const panel = (await menu(page).boundingBox())!;
    const button = (await trigger(page).boundingBox())!;
    const footer = (await page.getByTestId('app-sidebar-user-name').boundingBox())!;
    expect(panel.y + panel.height, 'panel bottom vs trigger top').toBeLessThanOrEqual(button.y);
    expect(panel.y + panel.height, 'panel bottom vs user name top').toBeLessThanOrEqual(footer.y);

    // Nothing was saved: a reload is still Vietnamese.
    await page.unroute('**/api/auth/update-user');
    await page.reload();
    await expect(trigger(page)).toHaveAccessibleName(`Tài khoản của ${NAME}`);
  });

  // Example · Account menu open at 1440 px: the panel's left edge lines up with the sidebar content
  // (the user row, 16 px in) and its bottom stops above the footer divider (the user row's top
  // border), which stays visible. Checked in vi then en, since the en copy changes the panel's size.
  for (const [lang, copy] of [
    ['vi', menuVi],
    ['en', menuEn],
  ] as const) {
    test(`${lang}: the panel sits on the sidebar column and above the footer divider, as designed`, async ({
      page,
    }, testInfo) => {
      await signInMember(page, uniqueEmail(testInfo, `qa116q-geo-${lang}`));
      if (lang === 'en') {
        await trigger(page).click();
        await menu(page).getByRole('menuitemradio', { name: menuVi.languageEn }).click();
        await expect(menu(page).getByTestId('account-menu-heading')).toHaveText(menuEn.heading);
        await page.keyboard.press('Escape');
      }
      await trigger(page).click();
      await expect(menu(page).getByTestId('account-menu-heading')).toHaveText(copy.heading);
      await page.screenshot({ path: testInfo.outputPath(`account-menu-geometry-${lang}.png`) });

      const panel = (await menu(page).boundingBox())!;
      const userRow = (await page.getByTestId('app-sidebar-user').boundingBox())!;
      expect
        .soft(Math.round(panel.x), 'panel left edge vs sidebar content edge (design: 16)')
        .toBe(Math.round(userRow.x));
      expect
        .soft(
          Math.round(panel.y + panel.height),
          'panel bottom vs footer divider (user row top border)',
        )
        .toBeLessThanOrEqual(Math.round(userRow.y));
    });
  }

  test('personal settings goes to /settings/personal', async ({ page }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116q-settings'));
    await trigger(page).click();
    await menu(page).getByRole('menuitem', { name: menuVi.personalSettings }).click();
    await expect(page).toHaveURL(/\/settings\/personal$/);
    await expect(menu(page)).toBeHidden();
  });

  test('Arrow Up, Home and End reach the ends; Tab leaves the menu', async ({ page }, testInfo) => {
    await signInMember(page, uniqueEmail(testInfo, 'qa116q-keys'));
    await trigger(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu(page)).toBeVisible();

    await page.keyboard.press('ArrowUp');
    await expect(page.locator(':focus')).toHaveText(menuVi.signOut);
    await page.keyboard.press('Home');
    await expect(page.locator(':focus')).toHaveText(menuVi.personalSettings);
    await page.keyboard.press('End');
    await expect(page.locator(':focus')).toHaveText(menuVi.signOut);

    // Space on a radio option selects it, like a click.
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveText(menuVi.themeLight);
    await page.keyboard.press(' ');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(menu(page)).toBeHidden();
  });
});
