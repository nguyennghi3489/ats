// Issue #113: the desktop app layout and its role-based sidebar against the real API and the Compose
// Postgres. An admin, a recruiter and a collaborator of one workspace are seeded per test: each signs
// up through `support/session.ts` (their display name is then set in Postgres), the admin creates the
// workspace through `POST /api/workspaces`, and the other two are added as members with psql (the
// invitation flow comes later) and switch to it through `PUT /api/workspaces/active`.
//
// The 1440 px light / dark baselines (design "02 · App shell": Example · Desktop list, chrome only,
// Example · Collaborator view and Example · Dark desktop) live in app-shell.spec.ts-snapshots/, one
// per platform: `-linux` is what CI compares against and `-darwin` serves local runs on macOS. The
// main area holds the "coming soon" placeholder until the jobs page lands. Refresh both with
// `--update-snapshots` after a visual change.
import { type Browser, expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const nav = vi.shell.nav;
const roles = vi.shell.roles;

type Role = 'admin' | 'recruiter' | 'collaborator';

const NAMES: Record<Role, string> = {
  admin: 'Minh Anh',
  recruiter: 'Thu Hà',
  collaborator: 'Lan Chi',
};

/** Sidebar links per role, in visual order (workspace settings last, admins only). */
const EXPECTED_ITEMS: Record<Role, string[]> = {
  admin: [nav.applications, nav.candidates, nav.jobs, nav.workspaceSettings],
  recruiter: [nav.applications, nav.candidates, nav.jobs],
  collaborator: [nav.myApplications, nav.myJobs],
};

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

/** Adds the user behind `email` to the workspace with `role`, and makes it their active one. */
async function joinWorkspace(page: Page, email: string, workspaceId: string, role: Role) {
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select gen_random_uuid()::text, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  const response = await page.request.put('/api/workspaces/active', { data: { workspaceId } });
  expect(response.status(), `PUT /api/workspaces/active as ${role}`).toBe(200);
}

/**
 * Signs `role` in on a page of its own, as a member of a fresh "An Nhiên" workspace. Every role but
 * the admin joins a workspace an admin created in a separate browser context.
 */
async function signInAs(
  browser: Browser,
  page: Page,
  role: Role,
  tag: string,
): Promise<{ email: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `qa113-${role}-${tag}-${stamp}@example.test`;
  if (role === 'admin') {
    await signIn(page, email, NAMES.admin);
    await createWorkspace(page, 'An Nhiên');
    return { email };
  }
  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, `qa113-admin-${tag}-${stamp}@example.test`, NAMES.admin);
    const workspaceId = await createWorkspace(adminPage, 'An Nhiên');
    await signIn(page, email, NAMES[role]);
    await joinWorkspace(page, email, workspaceId, role);
  } finally {
    await adminContext.close();
  }
  return { email };
}

const sidebar = (page: Page) => page.getByTestId('app-sidebar');
const sidebarLinks = (page: Page) =>
  sidebar(page).getByRole('navigation', { name: nav.label }).getByRole('link');

test.describe('app shell sidebar by role', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  for (const role of ['admin', 'recruiter', 'collaborator'] as const) {
    test(`a ${role} sees their items, name and role`, async ({ browser, page }, testInfo) => {
      await signInAs(browser, page, role, `items${testInfo.workerIndex}`);

      await page.goto('/jobs');
      await expect(page.getByTestId('placeholder-page')).toBeVisible();
      await expect(sidebar(page)).toBeVisible();
      await expect(sidebarLinks(page)).toHaveText(EXPECTED_ITEMS[role]);
      await expect(page.getByTestId('app-sidebar-user-name')).toHaveText(NAMES[role]);
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(roles[role]);

      const settings = sidebar(page).getByRole('link', { name: nav.workspaceSettings });
      await expect(settings).toHaveCount(role === 'admin' ? 1 : 0);
      if (role === 'collaborator') {
        await expect(sidebar(page).getByRole('link', { name: nav.candidates })).toHaveCount(0);
      }
    });
  }

  test('a collaborator opening /candidates or /settings/workspace lands on /jobs', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'collaborator', `redir${testInfo.workerIndex}`);

    await page.goto('/candidates');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('placeholder-page')).toBeVisible();
    await expect(sidebarLinks(page)).toHaveText(EXPECTED_ITEMS.collaborator);

    await page.goto('/settings/workspace');
    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('a recruiter opening /settings/workspace lands on /jobs; /candidates opens', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'recruiter', `redir${testInfo.workerIndex}`);

    await page.goto('/settings/workspace');
    await expect(page).toHaveURL(/\/jobs$/);
    await page.goto('/candidates');
    await expect(page).toHaveURL(/\/candidates$/);
    await expect(page.getByTestId('placeholder-page')).toBeVisible();
  });

  test('the current page carries aria-current and every item is reached with Tab in order', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'admin', `keys${testInfo.workerIndex}`);

    // `/` opens `/jobs` inside the layout.
    await page.goto('/');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    const current = sidebar(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(nav.jobs);

    // Clicking another item moves aria-current with the route.
    await sidebarLinks(page).filter({ hasText: nav.candidates }).click();
    await expect(page).toHaveURL(/\/candidates$/);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(nav.candidates);
    await sidebarLinks(page).filter({ hasText: nav.workspaceSettings }).click();
    await expect(page).toHaveURL(/\/settings\/workspace$/);
    await expect(current).toHaveText(nav.workspaceSettings);

    // From the top of the document, Tab walks the sidebar links in visual order.
    await page.goto('/jobs');
    await expect(sidebarLinks(page)).toHaveCount(4);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const reached: string[] = [];
    for (let step = 0; step < 12 && reached.length < 4; step++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element?.closest('[data-testid="app-sidebar"] nav')) return null;
        return element.textContent?.trim() ?? '';
      });
      if (focused !== null) reached.push(focused);
    }
    expect(reached).toEqual(EXPECTED_ITEMS.admin);

    // Tab order matches visual order: each reached link sits below the previous one.
    const tops = await sidebarLinks(page).evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().top),
    );
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  });

  test('pages outside the workspace render no sidebar', async ({ page }, testInfo) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('app-layout')).toHaveCount(0);

    // Without a workspace every page inside the layout sends the user to /welcome (#107).
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa113-out'));
    for (const path of ['/welcome', '/jobs', '/candidates']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/welcome$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.welcome.title);
      await expect(page.getByTestId('app-sidebar'), path).toHaveCount(0);
      await expect(page.getByTestId('app-layout'), path).toHaveCount(0);
    }

    await createWorkspace(page, 'An Nhiên');
    for (const path of ['/workspaces', '/workspaces/new']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByTestId('app-sidebar'), path).toHaveCount(0);
      await expect(page.getByTestId('app-layout'), path).toHaveCount(0);
    }
  });
});

test.describe('app shell breakpoint', () => {
  test.use({ locale: 'vi-VN' });

  for (const { width, shown } of [
    { width: 767, shown: false },
    { width: 768, shown: true },
  ]) {
    test(`at ${width} px the sidebar is ${shown ? 'shown' : 'hidden'}`, async ({
      browser,
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await signInAs(browser, page, 'admin', `bp${width}-${testInfo.workerIndex}`);

      await page.goto('/jobs');
      await expect(page.getByTestId('placeholder-page')).toBeVisible();
      if (shown) {
        await expect(sidebar(page)).toBeVisible();
        await expect(sidebarLinks(page)).toHaveText(EXPECTED_ITEMS.admin);
        const box = await sidebar(page).boundingBox();
        expect(box?.width).toBe(224);
      } else {
        await expect(sidebar(page)).toBeHidden();
        for (const link of await sidebarLinks(page).all()) await expect(link).toBeHidden();
        // The main area takes the full width.
        const main = await page.locator('main').boundingBox();
        expect(main?.x).toBe(0);
        expect(main?.width).toBe(width);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
    });
  }
});

test.describe('app shell matches the design', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  async function expectScreenshot(page: Page, name: string): Promise<void> {
    // The design shows no focused control and no hover.
    await page.mouse.move(1439, 899);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme });
      });

      // Admin on /jobs: Example · Desktop list (light) and Example · Dark desktop (dark).
      test(`admin desktop at 1440 px (${colorScheme})`, async ({ browser, page }, testInfo) => {
        await signInAs(browser, page, 'admin', `shot-${colorScheme}${testInfo.workerIndex}`);
        await page.goto('/jobs');
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
        await expect(sidebarLinks(page)).toHaveText(EXPECTED_ITEMS.admin);
        await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(roles.admin);
        await expectScreenshot(page, `desktop-admin-1440-${colorScheme}`);
      });

      // Collaborator on /jobs: Example · Collaborator view.
      test(`collaborator view at 1440 px (${colorScheme})`, async ({ browser, page }, testInfo) => {
        await signInAs(browser, page, 'collaborator', `shot-${colorScheme}${testInfo.workerIndex}`);
        await page.goto('/jobs');
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
        await expect(sidebarLinks(page)).toHaveText(EXPECTED_ITEMS.collaborator);
        await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(roles.collaborator);
        await expectScreenshot(page, `desktop-collaborator-1440-${colorScheme}`);
      });
    });
  }
});
