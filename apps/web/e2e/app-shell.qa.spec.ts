// QA for issue #113 (desktop app layout and role-based sidebar), on top of app-shell.spec.ts:
// English copy for every role (live switch and an English browser), aria-current and Tab order for
// the recruiter and collaborator sidebars, every placeholder route inside the layout, the signed-out
// redirect from `/`, the fixed sidebar while the main area scrolls, and the footer and pinned
// settings geometry from "02 · App shell" (Example · Desktop list). Users and workspaces are
// synthetic and seeded through the API and psql, like app-shell.spec.ts.
import { type Browser, expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewUser, sqlString } from './support/session';

type Role = 'admin' | 'recruiter' | 'collaborator';
type Locale = 'vi' | 'en';

const NAMES: Record<Role, string> = {
  admin: 'Minh Anh',
  recruiter: 'Thu Hà',
  collaborator: 'Lan Chi',
};

function expectedItems(locale: Locale, role: Role): string[] {
  const nav = (locale === 'vi' ? vi : en).shell.nav;
  if (role === 'collaborator') return [nav.myApplications, nav.myJobs];
  const main = [nav.applications, nav.candidates, nav.jobs];
  return role === 'admin' ? [...main, nav.workspaceSettings] : main;
}

async function signIn(page: Page, email: string, name: string, locale: Locale): Promise<void> {
  await signInAsNewUser(page, email, locale);
  psql(`update "user" set name = ${sqlString(name)} where email = ${sqlString(email)}`);
}

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

async function signInAs(
  browser: Browser,
  page: Page,
  role: Role,
  tag: string,
  locale: Locale = 'vi',
): Promise<void> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `qa113q-${role}-${tag}-${stamp}@example.test`;
  if (role === 'admin') {
    await signIn(page, email, NAMES.admin, locale);
    await createWorkspace(page, 'An Nhiên');
    return;
  }
  const adminContext = await browser.newContext();
  try {
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, `qa113q-admin-${tag}-${stamp}@example.test`, NAMES.admin, locale);
    const workspaceId = await createWorkspace(adminPage, 'An Nhiên');
    await signIn(page, email, NAMES[role], locale);
    psql(
      `insert into member (id, organization_id, user_id, role, status)
       select gen_random_uuid()::text, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
       from "user" where email = ${sqlString(email)}`,
    );
    const response = await page.request.put('/api/workspaces/active', { data: { workspaceId } });
    expect(response.status(), `PUT /api/workspaces/active as ${role}`).toBe(200);
  } finally {
    await adminContext.close();
  }
}

async function setLocaleInPage(page: Page, locale: Locale): Promise<void> {
  await page.evaluate(
    async ([path, value]) => {
      const mod = (await import(/* @vite-ignore */ path)) as {
        setLocale: (l: 'vi' | 'en') => void;
      };
      mod.setLocale(value as 'vi' | 'en');
    },
    ['/src/i18n/index.ts', locale] as const,
  );
}

const sidebar = (page: Page) => page.getByTestId('app-sidebar');
const navLinks = (page: Page, locale: Locale = 'vi') =>
  sidebar(page)
    .getByRole('navigation', { name: (locale === 'vi' ? vi : en).shell.nav.label })
    .getByRole('link');

/** Tabs from the top of the document and returns the sidebar links reached, in order. */
async function tabThroughSidebar(page: Page, count: number): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const reached: string[] = [];
  for (let step = 0; step < 12 && reached.length < count; step++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element?.closest('[data-testid="app-sidebar"] nav')) return null;
      return element.textContent?.trim() ?? '';
    });
    if (focused !== null) reached.push(focused);
  }
  return reached;
}

test.describe('QA #113 English copy', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const role of ['admin', 'recruiter', 'collaborator'] as const) {
    test.describe(`${role}`, () => {
      test.use({ locale: 'vi-VN' });

      test(`vi first, then a live switch to en shows the ${role} items and role in English`, async ({
        browser,
        page,
      }, testInfo) => {
        await signInAs(browser, page, role, `en${testInfo.workerIndex}`);
        // A placeholder page every role has (/jobs is the jobs list since #127).
        await page.goto('/applications');
        await expect(navLinks(page)).toHaveText(expectedItems('vi', role));
        await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(vi.shell.roles[role]);
        await expect(page.getByTestId('placeholder-page')).toContainText(
          vi.shell.placeholder.title,
        );

        await setLocaleInPage(page, 'en');
        await expect(navLinks(page, 'en')).toHaveText(expectedItems('en', role));
        await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(en.shell.roles[role]);
        await expect(page.getByTestId('app-sidebar-user-name')).toHaveText(NAMES[role]);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          en.shell.placeholder.title,
        );
        await expect(page.getByTestId('placeholder-page')).toContainText(
          en.shell.placeholder.description,
        );
        await expect(sidebar(page)).not.toContainText(vi.shell.nav.jobs);
        await page.screenshot({ path: testInfo.outputPath(`app-shell-${role}-en.png`) });
      });
    });
  }

  test.describe('an English browser', () => {
    test.use({ locale: 'en-US' });

    test('a recruiter signed up in English sees the English sidebar on first load', async ({
      browser,
      page,
    }, testInfo) => {
      await signInAs(browser, page, 'recruiter', `enb${testInfo.workerIndex}`, 'en');
      await page.goto('/candidates');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(navLinks(page, 'en')).toHaveText(expectedItems('en', 'recruiter'));
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(en.shell.roles.recruiter);
      await expect(sidebar(page).locator('[aria-current="page"]')).toHaveText(
        en.shell.nav.candidates,
      );
    });
  });
});

test.describe('QA #113 current page and keyboard for other roles', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('collaborator: aria-current follows the route and Tab reaches both items in order', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'collaborator', `kb${testInfo.workerIndex}`);
    const nav = vi.shell.nav;
    const current = sidebar(page).locator('[aria-current="page"]');

    await page.goto('/applications');
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(nav.myApplications);

    await navLinks(page).filter({ hasText: nav.myJobs }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(nav.myJobs);

    expect(await tabThroughSidebar(page, 2)).toEqual(expectedItems('vi', 'collaborator'));

    // Enter on a focused item navigates (fresh load, so Tab starts from the top of the document).
    await page.goto('/jobs');
    await expect(navLinks(page)).toHaveCount(2);
    expect(await tabThroughSidebar(page, 1)).toEqual([nav.myApplications]);
    await expect(page.locator(':focus')).toHaveText(nav.myApplications);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/applications$/);
    await expect(current).toHaveText(nav.myApplications);
  });

  test('recruiter: aria-current on Ứng viên and Tab reaches the three items in order', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'recruiter', `kb${testInfo.workerIndex}`);
    await page.goto('/candidates');
    const current = sidebar(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(vi.shell.nav.candidates);
    expect(await tabThroughSidebar(page, 3)).toEqual(expectedItems('vi', 'recruiter'));
  });
});

test.describe('QA #113 routes and layout', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('a signed-out visitor at / or /candidates gets sign-in without the sidebar', async ({
    page,
  }) => {
    for (const path of ['/', '/candidates', '/settings/workspace']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in/);
      await expect(page.getByTestId('app-sidebar'), path).toHaveCount(0);
    }
  });

  test('every placeholder route opens inside the layout with the "coming soon" state', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'admin', `routes${testInfo.workerIndex}`);
    // /jobs is the jobs list since #127.
    for (const path of ['/applications', '/candidates', '/settings/workspace']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await expect(page.getByTestId('app-layout'), path).toBeVisible();
      await expect(page.locator('main').getByTestId('placeholder-page'), path).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(
        vi.shell.placeholder.title,
      );
    }
    // /settings/personal is no longer a placeholder (#121) but still opens inside the layout, and
    // it has no sidebar item, so nothing is marked current.
    await page.goto('/settings/personal');
    await expect(page.getByTestId('app-layout')).toBeVisible();
    await expect(page.locator('main').getByTestId('personal-settings')).toBeVisible();
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(0);
  });

  test('the sidebar stays fixed while the main area scrolls', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'admin', `scroll${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();

    // Make the routed page taller than the viewport, as a long list would.
    await page.locator('main').evaluate((main) => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      main.appendChild(filler);
    });
    await page.locator('main').evaluate((main) => main.scrollTo(0, 1500));
    expect(await page.locator('main').evaluate((main) => main.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const box = await sidebar(page).boundingBox();
    expect(box?.y).toBe(0);
    expect(box?.height).toBe(900);
    await expect(page.getByTestId('app-sidebar-user')).toBeInViewport();
  });

  test('footer and pinned settings follow Example · Desktop list', async ({
    browser,
    page,
  }, testInfo) => {
    await signInAs(browser, page, 'admin', `geom${testInfo.workerIndex}`);
    await page.goto('/jobs');
    await expect(navLinks(page)).toHaveCount(4);

    await expect(page.getByTestId('app-sidebar-avatar')).toHaveText('MA');
    const user = await page.getByTestId('app-sidebar-user').boundingBox();
    const settings = await navLinks(page)
      .filter({ hasText: vi.shell.nav.workspaceSettings })
      .boundingBox();
    const jobs = await navLinks(page).filter({ hasText: vi.shell.nav.jobs }).boundingBox();
    if (!user || !settings || !jobs) throw new Error('missing sidebar boxes');

    // Settings is pinned near the bottom, far below the main items and just above the user row.
    expect(settings.y).toBeGreaterThan(jobs.y + 400);
    expect(user.y).toBeGreaterThan(settings.y + settings.height);
    expect(user.y + user.height).toBeGreaterThan(900 - 64);
    // The design's main items and settings span the 192 px inside the 16 px inset.
    expect(settings.x).toBe(16);
    expect(settings.width).toBe(191);
  });
});

// The criteria say a seeded user "signs in": the specs above seed the session through the auth
// client, so here each role goes through the real sign-in form in a fresh session, lands on /jobs
// inside the layout (the only workspace becomes active, #107) and sees its sidebar. The vi and en
// screenshots are kept in test-results as evidence for the design comparison.
test.describe('QA #113 sign-in form to the app layout', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  for (const role of ['admin', 'recruiter', 'collaborator'] as const) {
    test(`a seeded ${role} signs in through the form and lands on /jobs with their sidebar`, async ({
      browser,
      page,
    }, testInfo) => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const email = `qa113f-${role}-${testInfo.workerIndex}-${stamp}@example.test`;
      if (role === 'admin') {
        await signIn(page, email, NAMES.admin, 'vi');
        await createWorkspace(page, 'An Nhiên');
      } else {
        const adminContext = await browser.newContext();
        try {
          const adminPage = await adminContext.newPage();
          const adminEmail = `qa113f-admin-${testInfo.workerIndex}-${stamp}@example.test`;
          await signIn(adminPage, adminEmail, NAMES.admin, 'vi');
          const workspaceId = await createWorkspace(adminPage, 'An Nhiên');
          await signIn(page, email, NAMES[role], 'vi');
          psql(
            `insert into member (id, organization_id, user_id, role, status)
             select gen_random_uuid()::text, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
             from "user" where email = ${sqlString(email)}`,
          );
        } finally {
          await adminContext.close();
        }
      }

      // Drop the seeding session: the user now signs in like anyone else.
      await page.context().clearCookies();
      await page.goto('/sign-in');
      await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
      await page.getByLabel(vi.auth.signIn.email).fill(email);
      await page.getByLabel(vi.auth.signIn.password, { exact: true }).fill('qa-Password-e2e!');
      await page.getByTestId('sign-in-submit').click();

      await expect(page).toHaveURL(/\/jobs$/);
      await expect(page.getByTestId('app-layout')).toBeVisible();
      await expect(navLinks(page)).toHaveText(expectedItems('vi', role));
      await expect(
        sidebar(page).getByRole('link', { name: vi.shell.nav.workspaceSettings }),
      ).toHaveCount(role === 'admin' ? 1 : 0);
      await expect(page.getByTestId('app-sidebar-user-name')).toHaveText(NAMES[role]);
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(vi.shell.roles[role]);
      await expect(sidebar(page).locator('[aria-current="page"]')).toHaveText(
        role === 'collaborator' ? vi.shell.nav.myJobs : vi.shell.nav.jobs,
      );
      await page.mouse.move(1439, 899);
      await page.screenshot({ path: testInfo.outputPath(`app-shell-${role}-signed-in-vi.png`) });

      if (role === 'collaborator') {
        await page.goto('/candidates');
        await expect(page).toHaveURL(/\/jobs$/);
      }

      await setLocaleInPage(page, 'en');
      await expect(navLinks(page, 'en')).toHaveText(expectedItems('en', role));
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(en.shell.roles[role]);
      await page.screenshot({ path: testInfo.outputPath(`app-shell-${role}-signed-in-en.png`) });
    });
  }
});
