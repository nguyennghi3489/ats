// Issue #117: the mobile top bar and its navigation list, at 360 px against the real API and the
// Compose Postgres. An admin creates an "An Nhiên" workspace through `POST /api/workspaces`; a
// collaborator is added to it with psql (the invitation flow comes later) and switches to it through
// `PUT /api/workspaces/active`. Captures at 390 px, light and dark, are written to the test output for
// comparison with design "02 · App shell", Example · Mobile navigation closed and open.
import { type Browser, expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewUser, sqlString } from './support/session';

const nav = vi.shell.nav;
const copy = vi.shell.mobileNav;

/** Signs a fresh user in on `page` and gives them `name`. */
async function signIn(page: Page, email: string, name: string): Promise<void> {
  await signInAsNewUser(page, email);
  psql(`update "user" set name = ${sqlString(name)} where email = ${sqlString(email)}`);
}

/** Creates a workspace as the signed-in user; the API makes it the session's active one. */
async function createWorkspace(page: Page, name: string): Promise<string> {
  const result = await page.evaluate(async (workspaceName) => {
    const response = await fetch('/api/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': globalThis.crypto.randomUUID(),
      },
      body: JSON.stringify({ name: workspaceName }),
    });
    return { status: response.status, body: (await response.json()) as { id: string } };
  }, name);
  expect(result.status, `POST /api/workspaces ${name}`).toBe(201);
  return result.body.id;
}

function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signInAdmin(page: Page, tag: string): Promise<void> {
  await signIn(page, `qa117-admin-${tag}-${stamp()}@example.test`, 'Minh Anh');
  await createWorkspace(page, 'An Nhiên');
}

async function signInCollaborator(browser: Browser, page: Page, tag: string): Promise<void> {
  const id = stamp();
  const adminContext = await browser.newContext();
  let workspaceId: string;
  try {
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, `qa117-admin-${tag}-${id}@example.test`, 'Minh Anh');
    workspaceId = await createWorkspace(adminPage, 'An Nhiên');
  } finally {
    await adminContext.close();
  }
  const email = `qa117-collaborator-${tag}-${id}@example.test`;
  await signIn(page, email, 'Lan Chi');
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select gen_random_uuid()::text, ${sqlString(workspaceId)}, id, 'collaborator', 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  const response = await page.request.put('/api/workspaces/active', { data: { workspaceId } });
  expect(response.status()).toBe(200);
}

const topBar = (page: Page) => page.getByTestId('app-top-bar');
const hamburger = (page: Page) => page.getByTestId('app-top-bar-menu');
const mobileLinks = (page: Page) =>
  page.getByTestId('mobile-nav').getByRole('navigation', { name: nav.label }).getByRole('link');

test.describe('mobile top bar and navigation', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 800 } });

  test('an admin gets the top bar, the full list, and a tap navigates and closes it', async ({
    page,
  }, testInfo) => {
    await signInAdmin(page, `nav-${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();

    await expect(topBar(page)).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(hamburger(page)).toHaveAccessibleName(copy.open);

    await hamburger(page).click();
    await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(hamburger(page)).toHaveAccessibleName(copy.close);
    await expect(mobileLinks(page)).toHaveText([
      nav.applications,
      nav.candidates,
      nav.jobs,
      nav.workspaceSettings,
    ]);
    for (const link of await mobileLinks(page).all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // The list pushes the page down rather than covering it.
    const list = (await page.getByTestId('mobile-nav').boundingBox())!;
    const main = (await page.locator('main').boundingBox())!;
    expect(main.y).toBeGreaterThanOrEqual(list.y + list.height);

    await mobileLinks(page).filter({ hasText: nav.candidates }).click();
    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
    await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('a collaborator sees only their applications and jobs', async ({
    browser,
    page,
  }, testInfo) => {
    await signInCollaborator(browser, page, `collab-${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await hamburger(page).click();

    await expect(mobileLinks(page)).toHaveText([nav.myApplications, nav.myJobs]);
  });

  test('Escape closes the list and focuses the hamburger', async ({ page }, testInfo) => {
    await signInAdmin(page, `esc-${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await hamburger(page).click();
    await mobileLinks(page).first().focus();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
    await expect(hamburger(page)).toBeFocused();
  });

  test('the workspace trigger switches workspaces and the avatar opens the account menu', async ({
    page,
  }, testInfo) => {
    await signInAdmin(page, `menus-${testInfo.workerIndex}`);
    await createWorkspace(page, 'Mây Studio');
    await page.goto('/jobs');
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');

    await page.getByTestId('workspace-menu-trigger').click();
    await page.getByRole('menu').getByRole('menuitem', { name: 'An Nhiên' }).click();
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('An Nhiên');
    await expect(page).toHaveURL(/\/jobs$/);

    await page.getByTestId('account-menu-trigger').click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText(vi.shell.accountMenu.heading);
    await expect(menu.getByRole('menuitem', { name: vi.shell.accountMenu.signOut })).toBeVisible();
    const panel = (await menu.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(360);
  });

  test('growing to 1024 px with the list open shows the sidebar and no top bar or list', async ({
    page,
  }, testInfo) => {
    await signInAdmin(page, `resize-${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await hamburger(page).click();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 800 });

    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(topBar(page)).toHaveCount(0);
    await expect(page.getByTestId('mobile-nav')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`390 px captures, closed and open, ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: theme });
      await signInAdmin(page, `shot-${theme}-${testInfo.workerIndex}`);
      await page.goto('/jobs');
      await expect(page.getByTestId('jobs-list-page')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      await page.screenshot({ path: testInfo.outputPath(`mobile-nav-closed-${theme}-390.png`) });
      await hamburger(page).click();
      await expect(page.getByTestId('mobile-nav')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`mobile-nav-open-${theme}-390.png`) });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
