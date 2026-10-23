// QA for issue #122: "Đổi mật khẩu" on personal settings, against the real API and the Compose
// Postgres. Covers what change-password.spec.ts leaves out: the vi then en copy and layout (no
// design screen; the section must follow the other personal settings sections in the same column),
// the shared password rule in a real browser with the sign-up message, the busy button and a single
// request on double submit, errors tied to their field with aria-describedby, other failures in an
// alert, the other device signed out through an in-app navigation, and signing in through the
// sign-in form with the new and old passwords. 1440 light/dark and 360 px screenshots.
import { type Browser, expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { signInAsNewMember, uniqueEmail } from './support/session';

const viCopy = vi.settings.password;
const enCopy = en.settings.password;
const oldPassword = 'qa-Password-e2e!';
const newPassword = 'qa-Changed-qa122-3!';
const changeUrl = '**/api/auth/change-password';

const section = (page: Page) => page.getByTestId('change-password-section');
const field = (page: Page, name: string) =>
  section(page).getByRole('textbox', { name, exact: true });

async function openSettings(page: Page, email: string): Promise<void> {
  await signInAsNewMember(page, email);
  await page.goto('/settings/personal');
  await expect(page.getByRole('heading', { level: 2, name: viCopy.heading })).toBeVisible();
}

async function fill(page: Page, copy: typeof viCopy, current: string, next: string, again = next) {
  await field(page, copy.current).fill(current);
  await field(page, copy.new).fill(next);
  await field(page, copy.confirm).fill(again);
}

async function expectCopy(page: Page, copy: typeof viCopy): Promise<void> {
  const s = section(page);
  await expect(s.getByRole('heading', { level: 2 })).toHaveText(copy.heading);
  for (const label of [copy.current, copy.new, copy.confirm]) {
    await expect(field(page, label)).toHaveAttribute('type', 'password');
  }
  await expect(field(page, copy.new)).toHaveAccessibleDescription(copy.newHelper);
  await expect(s.getByRole('button', { name: copy.showCurrent })).toHaveText(copy.show);
  await expect(s.getByRole('button', { name: copy.showNew })).toHaveText(copy.show);
  await expect(s.getByRole('button', { name: copy.showConfirm })).toHaveText(copy.show);
  await expect(s.getByRole('button', { name: copy.submit, exact: true })).toBeEnabled();
}

/** Sign in through the sign-in form in a fresh context; true when it leaves /sign-in. */
async function formSignIn(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: vi.auth.signIn.email, exact: true }).fill(email);
  await page.getByRole('textbox', { name: vi.auth.signIn.password, exact: true }).fill(password);
  await page.getByTestId('sign-in-submit').click();
  const outcome = await Promise.race([
    page
      .waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 10_000 })
      .then(() => true),
    page
      .getByTestId('sign-in-error')
      .waitFor({ timeout: 10_000 })
      .then(() => false),
  ]);
  return outcome;
}

/** Signs `email` in on a second device through the form and opens personal settings there. */
async function secondDevice(browser: Browser, email: string) {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const other = await context.newPage();
  expect(await formSignIn(other, email, oldPassword)).toBe(true);
  await other.goto('/settings/personal');
  await expect(other.getByTestId('personal-settings')).toBeVisible();
  return { context, other };
}

async function changeHere(page: Page): Promise<void> {
  await fill(page, viCopy, oldPassword, newPassword);
  await section(page).getByTestId('change-password-submit').click();
  await expect(page.getByTestId('change-password-done')).toHaveText(viCopy.changed);
}

test.describe('change password (QA #122)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('shows the vi copy, then the en copy, last in the same column as the other sections', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa122-copy'));

    await expectCopy(page, viCopy);
    const headings = page.getByTestId('personal-settings').getByRole('heading', { level: 2 });
    await expect(headings.last()).toHaveText(viCopy.heading);
    const column = page.locator('.personal-settings__column');
    const columnBox = (await column.boundingBox())!;
    const box = (await section(page).boundingBox())!;
    expect(box.x).toBeCloseTo(columnBox.x, 0);
    expect(box.width).toBeLessThanOrEqual(columnBox.width + 0.5);
    const nameBox = (await page.getByTestId('personal-settings-name').boundingBox())!;
    const currentBox = (await field(page, viCopy.current).boundingBox())!;
    expect(currentBox.width).toBeCloseTo(nameBox.width, 0);
    await section(page).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('change-password-vi-1440.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: vi.settings.personal.language.en }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectCopy(page, enCopy);

    // Errors in English: mismatch, then the wrong current password from the API.
    await fill(page, enCopy, oldPassword, newPassword, 'other-Password-9');
    await section(page).getByRole('button', { name: enCopy.submit, exact: true }).click();
    await expect(field(page, enCopy.confirm)).toHaveAccessibleDescription(
      enCopy.errors.PASSWORD_MISMATCH,
    );
    await fill(page, enCopy, 'wrong-Password-9', newPassword);
    await section(page).getByRole('button', { name: enCopy.submit, exact: true }).click();
    await expect(field(page, enCopy.current)).toHaveAccessibleDescription(
      enCopy.errors.INVALID_PASSWORD,
    );
    await page.screenshot({
      path: testInfo.outputPath('change-password-en-errors-1440.png'),
      fullPage: true,
    });

    await fill(page, enCopy, oldPassword, newPassword);
    await section(page).getByRole('button', { name: enCopy.submit, exact: true }).click();
    await expect(page.getByTestId('change-password-done')).toHaveText(enCopy.changed);
    await page.screenshot({
      path: testInfo.outputPath('change-password-en-done-1440.png'),
      fullPage: true,
    });
  });

  test('a new password breaking the shared rule shows the sign-up message and sends nothing', async ({
    page,
  }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa122-rule'));
    let calls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/change-password')) calls += 1;
    });

    await fill(page, viCopy, oldPassword, 'short1');
    await section(page).getByRole('button', { name: viCopy.submit, exact: true }).click();
    const next = field(page, viCopy.new);
    await expect(next).toHaveAttribute('aria-invalid', 'true');
    await expect(next).toHaveAccessibleDescription(
      new RegExp(vi.auth.signUp.errors.PASSWORD_TOO_SHORT),
    );
    await expect(next).toBeFocused();

    await fill(page, viCopy, oldPassword, 'a'.repeat(129));
    await section(page).getByRole('button', { name: viCopy.submit, exact: true }).click();
    await expect(next).toHaveAccessibleDescription(
      new RegExp(vi.auth.signUp.errors.PASSWORD_TOO_LONG),
    );

    // Empty current password.
    await fill(page, viCopy, '', newPassword);
    await section(page).getByRole('button', { name: viCopy.submit, exact: true }).click();
    await expect(field(page, viCopy.current)).toHaveAccessibleDescription(
      viCopy.errors.CURRENT_PASSWORD_REQUIRED,
    );
    expect(calls).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath('change-password-vi-errors-1440.png'),
      fullPage: true,
    });
  });

  test('is busy while saving and a double submit sends one request', async ({ page }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa122-busy'));
    let calls = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(changeUrl, async (route) => {
      calls += 1;
      await held;
      await route.continue();
    });

    await fill(page, viCopy, oldPassword, newPassword);
    const button = section(page).getByTestId('change-password-submit');
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveText(viCopy.submitting);
    await field(page, viCopy.confirm)
      .press('Enter')
      .catch(() => undefined);
    await button.click({ force: true }).catch(() => undefined);
    await page.screenshot({ path: testInfo.outputPath('change-password-vi-busy-1440.png') });
    release();

    const done = page.getByTestId('change-password-done');
    await expect(done).toHaveText(viCopy.changed);
    await expect(done).toHaveAttribute('role', 'status');
    await expect(button).toHaveText(viCopy.submit);
    expect(calls).toBe(1);
  });

  test('another failure shows in an alert and keeps the fields', async ({ page }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa122-fail'));
    await page.route(changeUrl, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"BOOM"}' }),
    );

    await fill(page, viCopy, oldPassword, newPassword);
    await section(page).getByTestId('change-password-submit').click();
    const error = page.getByTestId('change-password-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(field(page, viCopy.current)).toHaveValue(oldPassword);
    await expect(page.getByTestId('change-password-done')).toHaveCount(0);
  });

  test('the other device ends on sign-in when it reloads; this one stays; the sign-in form takes only the new password', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa122-devices');
    await openSettings(page, email);
    const { context, other } = await secondDevice(browser, email);

    await changeHere(page);

    // A reload is a fresh start, not an expiry seen mid-session: it lands on sign-in (the notice
    // "Phiên đăng nhập đã hết hạn" is only for a session that ends while the app is open).
    await other.reload();
    await expect(other).toHaveURL(/\/sign-in/);
    await expect(other.getByTestId('sign-in-form')).toBeVisible();
    await other.screenshot({
      path: testInfo.outputPath('change-password-other-device-reload.png'),
    });
    await context.close();

    // This device stays signed in: an API call through the UI succeeds, and so does a reload.
    await page.getByTestId('personal-settings-name').fill('Thiết bị này');
    await page.getByTestId('personal-settings-save-name').click();
    await expect(page.getByTestId('personal-settings-profile-saved')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/settings\/personal$/);
    await expect(page.getByTestId('personal-settings-name')).toHaveValue('Thiết bị này');

    for (const [password, ok] of [
      [oldPassword, false],
      [newPassword, true],
    ] as const) {
      const ctx = await browser.newContext({ locale: 'vi-VN' });
      expect(await formSignIn(await ctx.newPage(), email, password)).toBe(ok);
      await ctx.close();
    }
  });

  // The other device's next API call made from the page it is on (a Better Auth endpoint, as every
  // personal settings action is) must also end on sign-in with "Phiên đăng nhập đã hết hạn".
  for (const action of ['save the name', 'change the password'] as const) {
    test(`the other device ends on sign-in when it tries to ${action}`, async ({
      browser,
      page,
    }, testInfo) => {
      const email = uniqueEmail(testInfo, 'qa122-next-call');
      await openSettings(page, email);
      const { context, other } = await secondDevice(browser, email);

      await changeHere(page);

      const answered = other.waitForResponse((r) =>
        /\/api\/auth\/(update-user|change-password)/.test(r.url()),
      );
      if (action === 'save the name') {
        await other.getByTestId('personal-settings-name').fill('Thiết bị khác');
        await other.getByTestId('personal-settings-save-name').click();
      } else {
        await fill(other, viCopy, newPassword, 'qa-Another-Password-4');
        await section(other).getByTestId('change-password-submit').click();
      }
      // The revoked session is refused (Better Auth answers 401 UNAUTHORIZED).
      expect((await answered).status()).toBe(401);
      await other.waitForTimeout(1000);
      await other.screenshot({
        path: testInfo.outputPath(`change-password-other-device-${action.replace(/ /g, '-')}.png`),
        fullPage: true,
      });
      await expect(other).toHaveURL(/\/sign-in/);
      await expect(other.getByTestId('sign-in-expired')).toHaveText(vi.auth.signIn.expired);
      await context.close();
    });
  }

  test('dark theme and 360 px in vi and en', async ({ page }, testInfo) => {
    await openSettings(page, uniqueEmail(testInfo, 'qa122-small'));
    await page.getByRole('radio', { name: vi.settings.personal.theme.dark }).check();
    await section(page).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('change-password-vi-dark-1440.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole('radio', { name: vi.settings.personal.theme.light }).check();
    await fill(page, viCopy, '', 'short1', 'x');
    await section(page).getByTestId('change-password-submit').click();
    await expect(field(page, viCopy.new)).toHaveAttribute('aria-invalid', 'true');
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(scroll).toBeLessThanOrEqual(0);
    const button = (await section(page).getByTestId('change-password-submit').boundingBox())!;
    // On mobile the button spans the column (the input sits inside a 1 px bordered control).
    const column = (await section(page).boundingBox())!;
    expect(button.width).toBeCloseTo(column.width, 0);
    const toggle = (await section(page)
      .getByTestId('change-password-current-toggle')
      .boundingBox())!;
    expect(toggle.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: testInfo.outputPath('change-password-vi-360.png'),
      fullPage: true,
    });

    await page.getByRole('radio', { name: vi.settings.personal.language.en }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(field(page, enCopy.new)).toHaveAccessibleDescription(
      new RegExp(en.auth.signUp.errors.PASSWORD_TOO_SHORT),
    );
    const scrollEn = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(scrollEn).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath('change-password-en-360.png'),
      fullPage: true,
    });
  });
});
