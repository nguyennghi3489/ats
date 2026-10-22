// Issue #115: the workspace menu on top of the sidebar, against the real API and the Compose
// Postgres. Each test signs a fresh synthetic user up (support/session.ts), names them in Postgres
// and creates the workspaces through `POST /api/workspaces`; the last one created is the session's
// active one, so the first is made active again through `PUT /api/workspaces/active`.
//
// The 1440 px light / dark baselines of the open menu (design "02 · App shell": Example · Workspace
// menu open) live in workspace-menu.spec.ts-snapshots/, one per platform: `-linux` is what CI
// compares against and `-darwin` serves local runs on macOS. Refresh both with `--update-snapshots`
// after a visual change.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const copy = vi.shell.workspaceMenu;

/** Created in this order; the API lists them by name (An Nhiên, Hải Đăng Labs, Mây Studio). */
const WORKSPACES = ['An Nhiên', 'Mây Studio', 'Hải Đăng Labs'] as const;

/**
 * Signs a fresh "Minh Anh" in as the admin of `names` (created in that order) with the first one
 * active, and opens `/jobs`. Returns the workspace ids in the same order.
 */
async function seed(
  page: Page,
  email: string,
  names: readonly string[] = WORKSPACES,
  locale: 'vi' | 'en' = 'vi',
): Promise<string[]> {
  await signInAsNewUser(page, email, locale);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  const ids: string[] = [];
  for (const name of names) ids.push(await createWorkspace(page, name));
  const response = await page.request.put('/api/workspaces/active', {
    data: { workspaceId: ids[0] },
  });
  expect(response.status(), 'PUT /api/workspaces/active').toBe(200);
  await page.goto('/jobs');
  await expect(trigger(page)).toContainText(names[0]!);
  return ids;
}

const trigger = (page: Page) => page.getByTestId('workspace-menu-trigger');
const menu = (page: Page) => page.getByRole('menu');
const items = (page: Page) => menu(page).getByRole('menuitem');
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name });

async function activeWorkspaceId(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { activeWorkspaceId: string | null }).activeWorkspaceId;
}

test.describe('workspace menu', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('a user in two workspaces switches to the second and lands on /jobs in it', async ({
    page,
  }, testInfo) => {
    const ids = await seed(page, uniqueEmail(testInfo, 'qa115-switch'), WORKSPACES.slice(0, 2));
    await page.goto('/candidates');

    await expect(page.getByTestId('workspace-menu-initial')).toHaveText('A');
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toContainText(copy.heading);
    await expect(items(page)).toHaveText(['An Nhiên', 'Mây Studio']);
    await expect(items(page).first()).toHaveAttribute('aria-current', 'true');
    await expect(items(page).nth(1)).not.toHaveAttribute('aria-current', /.*/);
    // Medium names, and the check drawn above the active one only.
    await expect(items(page).first()).toHaveCSS('font-weight', '500');
    const checks = await items(page).evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element, '::before').content),
    );
    expect(checks[0]).toContain('✓');
    expect(checks[1]).toBe('none');

    await item(page, 'Mây Studio').click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');
    await expect(page.getByTestId('workspace-menu-initial')).toHaveText('M');
    expect(await activeWorkspaceId(page)).toBe(ids[1]);

    // The new workspace stays active after a reload, and the menu now checks it.
    await page.reload();
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');
    await trigger(page).click();
    await expect(item(page, 'Mây Studio')).toHaveAttribute('aria-current', 'true');
  });

  test('choosing the active workspace only closes the menu', async ({ page }, testInfo) => {
    const ids = await seed(page, uniqueEmail(testInfo, 'qa115-same'));
    await page.goto('/candidates');
    const switches: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/workspaces/active')) switches.push(request.method());
    });

    await trigger(page).click();
    await items(page).first().click();

    await expect(menu(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/candidates$/);
    expect(switches).toEqual([]);
    expect(await activeWorkspaceId(page)).toBe(ids[0]);
  });

  test('a workspace that is no longer available reloads the list and keeps the current one', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa115-gone');
    const ids = await seed(page, email);
    await trigger(page).click();
    await expect(items(page)).toHaveCount(3);

    // Meanwhile the user's membership of Mây Studio is deactivated.
    psql(
      `update member set status = 'deactivated'
       where organization_id = ${sqlString(ids[1]!)}
         and user_id = (select id from "user" where email = ${sqlString(email)})`,
    );
    await item(page, 'Mây Studio').click();

    const notice = page.getByTestId('workspace-menu-error');
    await expect(notice).toHaveText(copy.unavailable);
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('An Nhiên');
    expect(await activeWorkspaceId(page)).toBe(ids[0]);

    await trigger(page).click();
    await expect(items(page)).toHaveText(['An Nhiên', 'Hải Đăng Labs']);
  });

  test('the keyboard opens, walks and closes the menu', async ({ page }, testInfo) => {
    const ids = await seed(page, uniqueEmail(testInfo, 'qa115-keys'));

    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    await expect(items(page).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items(page).nth(2)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items(page).nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();

    await page.keyboard.press(' ');
    await expect(menu(page)).toBeVisible();
    await expect(items(page).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');
    expect(await activeWorkspaceId(page)).toBe(ids[1]);
  });

  test('English copy', async ({ page }, testInfo) => {
    await seed(page, uniqueEmail(testInfo, 'qa115-en'), WORKSPACES, 'en');

    await trigger(page).click();
    await expect(menu(page)).toContainText(en.shell.workspaceMenu.heading);
    await expect(trigger(page)).toHaveAccessibleName(
      en.shell.workspaceMenu.trigger.replace('{name}', 'An Nhiên'),
    );
  });
});

test.describe('workspace menu matches the design', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  for (const colorScheme of ['light', 'dark'] as const) {
    // Example · Workspace menu open: An Nhiên active, three workspaces listed.
    test(`open menu at 1440 px (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await seed(page, uniqueEmail(testInfo, `qa115-shot-${colorScheme}`));
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);

      await trigger(page).click();
      await expect(items(page)).toHaveCount(3);
      // The design shows no focused item and no hover.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(1439, 899);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`workspace-menu-open-1440-${colorScheme}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
