// QA for issue #121: personal settings at /settings/personal, against the real API and the Compose
// Postgres. Covers what personal-settings.spec.ts leaves out: the vi then en copy and layout (no
// design screen; built from the foundation form composition, one column at most 560 px), keyboard
// order through every control, the locale and name refusals from the API in a real browser, the
// 80-character limit end to end, the theme kept on this device, and 360 px in English with errors.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewMember, sqlString, uniqueEmail } from './support/session';

const viCopy = vi.settings.personal;
const enCopy = en.settings.personal;

async function openSettings(page: Page, email: string): Promise<void> {
  await signInAsNewMember(page, email);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  await page.goto('/settings/personal');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(viCopy.title);
}

const nameField = (page: Page) => page.getByTestId('personal-settings-name');
const sidebarName = (page: Page) => page.getByTestId('app-sidebar-user-name');
const updateUser = '**/api/auth/update-user';

/** Every heading, label, legend, button and helper of the page in one locale. */
async function expectCopy(page: Page, copy: typeof viCopy): Promise<void> {
  const main = page.getByTestId('personal-settings');
  // The change-password section (#122) closes the page; its own copy is checked in its spec.
  const passwordHeading =
    copy === viCopy ? vi.settings.password.heading : en.settings.password.heading;
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(copy.title);
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    copy.profile.heading,
    copy.language.heading,
    copy.theme.heading,
    passwordHeading,
  ]);
  await expect(main.getByRole('textbox', { name: copy.profile.name })).toBeVisible();
  await expect(main.getByRole('textbox', { name: copy.profile.email })).toBeVisible();
  await expect(main.getByText(copy.profile.emailHelper)).toBeVisible();
  await expect(main.getByRole('button', { name: copy.profile.save })).toBeVisible();
  await expect(main.getByRole('group', { name: copy.language.legend })).toBeVisible();
  await expect(main.getByRole('group', { name: copy.theme.legend })).toBeVisible();
  for (const label of [copy.language.vi, copy.language.en]) {
    await expect(main.getByRole('radio', { name: label })).toBeVisible();
  }
  for (const label of [copy.theme.system, copy.theme.light, copy.theme.dark]) {
    await expect(main.getByRole('radio', { name: label, exact: true })).toBeVisible();
  }
  await expect(main.getByText(copy.theme.helper)).toBeVisible();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('personal settings (QA #121)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('shows the vi copy, then the en copy, in one column at most 560 px wide', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-copy'));

    await expectCopy(page, viCopy);
    const column = page.locator('.personal-settings__column');
    expect((await column.boundingBox())!.width).toBeLessThanOrEqual(560);
    await page.screenshot({ path: testInfo.outputPath('personal-settings-vi-1440.png') });

    await page.getByRole('radio', { name: viCopy.language.en }).check();
    await expectCopy(page, enCopy);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.screenshot({ path: testInfo.outputPath('personal-settings-en-1440.png') });
  });

  test('every control is reached by Tab in order and the theme is chosen with the arrows', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-keys'));
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

    await nameField(page).focus();
    const order = [
      'personal-settings-email',
      'personal-settings-save-name',
      'personal-settings-locale-vi',
    ];
    for (const testid of order) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId(testid)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    const themeRadio = page.locator('input[name="personal-settings-theme"]:focus');
    await expect(themeRadio).toHaveCount(1);

    // Arrow to "Tối" from wherever the group's tab stop is (system or light).
    for (let i = 0; i < 3; i++) {
      if ((await page.locator('html').getAttribute('data-theme')) === 'dark') break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(page.getByTestId('personal-settings-theme-dark')).toBeChecked();
    await expect(page.getByTestId('personal-settings-theme-dark')).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Keyboard save: Enter in the name field submits the form.
    await nameField(page).fill('Phạm Gia Bảo');
    await nameField(page).press('Enter');
    await expect(page.getByTestId('personal-settings-profile-saved')).toHaveText(
      viCopy.profile.saved,
    );
    await expect(sidebarName(page)).toHaveText('Phạm Gia Bảo');
  });

  test('a refused locale save brings Vietnamese back with the error and nothing is stored', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-locale-fail'));
    await page.route(updateUser, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Boom' }),
      }),
    );

    // click(), not check(): the radio goes back to Tiếng Việt as soon as the save is refused.
    await page.getByRole('radio', { name: viCopy.language.en }).click();

    await expect(page.getByTestId('personal-settings-locale-error')).toHaveText(
      viCopy.language.error,
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(viCopy.title);
    await expect(page.getByTestId('personal-settings-locale-vi')).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

    await page.unroute(updateUser);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(viCopy.title);
  });

  test('an API refusal of the name shows on the field and the sidebar keeps the old name', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-name-fail'));
    await page.route(updateUser, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Boom' }),
      }),
    );

    await nameField(page).fill('Trần Thu Hà');
    await page.getByTestId('personal-settings-save-name').click();

    await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(vi.errors.INTERNAL_ERROR)).toBeVisible();
    await expect(page.getByTestId('personal-settings-profile-saved')).toHaveCount(0);
    await expect(sidebarName(page)).toHaveText('Minh Anh');
  });

  test('81 characters are refused on the field; 80 are saved', async ({ page }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-length'));
    let calls = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/update-user')) calls++;
    });

    await nameField(page).fill('a'.repeat(81));
    await page.getByTestId('personal-settings-save-name').click();
    await expect(
      page.getByText(viCopy.profile.errors.NAME_TOO_LONG.replace('{max}', '80')),
    ).toBeVisible();
    expect(calls).toBe(0);

    const longest = `Nguyễn ${'b'.repeat(73)}`;
    expect(longest).toHaveLength(80);
    await nameField(page).fill(longest);
    await page.getByTestId('personal-settings-save-name').click();
    await expect(page.getByTestId('personal-settings-profile-saved')).toBeVisible();
    await page.reload();
    await expect(nameField(page)).toHaveValue(longest);
  });

  test('the theme is applied at once and kept on this device after a reload', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa121-theme'));

    await page.getByRole('radio', { name: viCopy.theme.dark, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: testInfo.outputPath('personal-settings-vi-dark-1440.png') });

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('personal-settings-theme-dark')).toBeChecked();
  });

  test('fits 360 px in vi and en, with the errors showing', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openSettings(page, uniqueEmail(testInfo, 'qa121-narrow'));

    await nameField(page).fill(' ');
    await page.getByTestId('personal-settings-save-name').click();
    await expect(page.getByText(viCopy.profile.errors.NAME_REQUIRED)).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath('personal-settings-vi-360.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: viCopy.language.en }).check();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(enCopy.title);
    await expect(page.getByText(enCopy.profile.errors.NAME_REQUIRED)).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const save = await page.getByTestId('personal-settings-save-name').boundingBox();
    const field = await nameField(page).boundingBox();
    expect(save!.x + save!.width).toBeLessThanOrEqual(360);
    expect(field!.x + field!.width).toBeLessThanOrEqual(360);
    await page.screenshot({
      path: testInfo.outputPath('personal-settings-en-360.png'),
      fullPage: true,
    });
  });
});
