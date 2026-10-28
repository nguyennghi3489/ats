// QA for issue #117 (mobile top bar and navigation list), against the Compose stack. Adds what
// mobile-nav.spec.ts leaves out: the design data (the three jobs of Example · Mobile navigation
// closed and open) for the 390 px captures in vi light, vi dark and en; the en copy of the hamburger
// and the list for an admin and a collaborator; the 48 px bar and 44 px touch targets of every
// top-bar control; aria-controls pointing at the list; a workspace switch from /candidates landing
// on /jobs as on desktop; and shrinking back to 360 px after a resize shows the list closed.
import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Locale = 'vi' | 'en';
const copyOf = { vi, en: en as unknown as typeof vi };

const DESIGN_JOBS = [
  { title: 'Product Designer', status: 'open' },
  { title: 'Chuyên viên Phát triển Đối tác Doanh nghiệp Khu vực Đông Nam Á', status: 'open' },
  { title: 'Kỹ sư Frontend', status: 'open' },
] as const;

async function admin(page: Page, email: string, locale: Locale = 'vi'): Promise<string> {
  await signInAsNewUser(page, email, locale);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  return createWorkspace(page, 'An Nhiên');
}

function seedDesignJobs(workspaceId: string, email: string): void {
  const values = DESIGN_JOBS.map(
    (job, i) =>
      `(${sqlString(randomUUID())}::uuid, ${sqlString(`QA-${String(i + 1).padStart(3, '0')}`)}, ` +
      `${sqlString(job.title)}, ${sqlString(job.status)}, ${i})`,
  ).join(', ');
  psql(
    `insert into jobs (id, workspace_id, code, title, status, created_by, owner_user_id, created_at)
     select v.id, ${sqlString(workspaceId)}, v.code, v.title, v.status, u.id, u.id,
            now() - (v.n || ' seconds')::interval
     from (values ${values}) as v(id, code, title, status, n)
     cross join "user" u where u.email = ${sqlString(email)}`,
  );
}

async function collaborator(browser: Browser, page: Page, tag: string, locale: Locale) {
  const adminContext = await browser.newContext();
  let workspaceId: string;
  try {
    workspaceId = await admin(await adminContext.newPage(), `${tag}-admin@example.test`);
  } finally {
    await adminContext.close();
  }
  const email = `${tag}-collab@example.test`;
  await signInAsNewUser(page, email, locale);
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select gen_random_uuid()::text, ${sqlString(workspaceId)}, id, 'collaborator', 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  const response = await page.request.put('/api/workspaces/active', { data: { workspaceId } });
  expect(response.status()).toBe(200);
}

const hamburger = (page: Page) => page.getByTestId('app-top-bar-menu');
const mobileNav = (page: Page) => page.getByTestId('mobile-nav');
const links = (page: Page) => mobileNav(page).getByRole('link');

async function expectTopBarGeometry(page: Page): Promise<void> {
  const bar = (await page.getByTestId('app-top-bar').locator('header').boundingBox())!;
  expect(Math.round(bar.height)).toBe(48);
  expect(bar.y).toBe(0);
  for (const id of ['app-top-bar-menu', 'workspace-menu-trigger', 'account-menu-trigger']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
  }
  // Order as drawn: hamburger, workspace name, then the avatar at the far end.
  const menu = (await hamburger(page).boundingBox())!;
  const ws = (await page.getByTestId('workspace-menu-trigger').boundingBox())!;
  const avatar = (await page.getByTestId('account-menu-trigger').boundingBox())!;
  expect(ws.x).toBeGreaterThanOrEqual(menu.x + menu.width - 1);
  expect(avatar.x + avatar.width).toBeGreaterThan(bar.width - 16);
}

test.describe('mobile navigation QA', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 360, height: 800 } });
  test.describe.configure({ timeout: 90_000 });

  test('Example · Mobile navigation closed and open at 390 px with the design jobs: vi light, vi dark, en', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = uniqueEmail(testInfo, 'qa117-design');
    seedDesignJobs(await admin(page, email), email);

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/jobs');
      await expect(page.getByTestId('jobs-list-page')).toBeVisible();
      await expect(page.getByText('Product Designer')).toBeVisible();
      await expect(page.getByTestId('workspace-menu-name')).toHaveText('An Nhiên');
      await expect(page.getByTestId('account-menu-trigger')).toContainText('MA');
      await expectTopBarGeometry(page);
      await page.screenshot({
        path: testInfo.outputPath(`qa-mobile-nav-closed-vi-${theme}-390.png`),
      });

      await hamburger(page).click();
      await expect(links(page)).toHaveText([
        vi.shell.nav.applications,
        vi.shell.nav.candidates,
        vi.shell.nav.jobs,
        vi.shell.nav.workspaceSettings,
      ]);
      // The current page is marked in the list, as the design highlights "Vị trí tuyển dụng".
      await expect(links(page).filter({ hasText: vi.shell.nav.jobs })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const bar = (await page.getByTestId('app-top-bar').locator('header').boundingBox())!;
      const list = (await mobileNav(page).boundingBox())!;
      expect(Math.abs(list.y - (bar.y + bar.height))).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`qa-mobile-nav-open-vi-${theme}-390.png`),
      });
      await hamburger(page).click();
      await expect(mobileNav(page)).toHaveCount(0);
    }

    // en: the account language is saved through the personal settings page.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings/personal');
    const saved = page.waitForResponse(
      (r) => r.request().method() !== 'GET' && r.url().includes('/api/'),
    );
    await page.getByRole('radio', { name: vi.settings.personal.language.en, exact: true }).check();
    await saved;
    await page.goto('/jobs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(hamburger(page)).toHaveAccessibleName(en.shell.mobileNav.open);
    await page.screenshot({ path: testInfo.outputPath('qa-mobile-nav-closed-en-light-390.png') });
    await hamburger(page).click();
    await expect(hamburger(page)).toHaveAccessibleName(en.shell.mobileNav.close);
    await expect(links(page)).toHaveText([
      en.shell.nav.applications,
      en.shell.nav.candidates,
      en.shell.nav.jobs,
      en.shell.nav.workspaceSettings,
    ]);
    await page.screenshot({ path: testInfo.outputPath('qa-mobile-nav-open-en-light-390.png') });
  });

  for (const locale of ['vi', 'en'] as const) {
    const copy = copyOf[locale];

    test(`${locale}: admin list, aria-controls, 44 px targets, tap closes`, async ({
      page,
    }, testInfo) => {
      await admin(page, uniqueEmail(testInfo, `qa117-admin-${locale}`), locale);
      await page.goto('/jobs');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
      await expect(hamburger(page)).toHaveAccessibleName(copy.shell.mobileNav.open);
      await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'false');

      await hamburger(page).click();
      await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'true');
      const controls = await hamburger(page).getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      await expect(page.locator(`[id="${controls}"]`)).toHaveRole('navigation');
      await expect(links(page)).toHaveText([
        copy.shell.nav.applications,
        copy.shell.nav.candidates,
        copy.shell.nav.jobs,
        copy.shell.nav.workspaceSettings,
      ]);
      for (const link of await links(page).all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await links(page).filter({ hasText: copy.shell.nav.candidates }).click();
      await expect(page).toHaveURL(/\/candidates$/);
      await expect(mobileNav(page)).toHaveCount(0);
      await expect(hamburger(page)).toHaveAccessibleName(copy.shell.mobileNav.open);
    });

    test(`${locale}: a collaborator sees only their applications and jobs`, async ({
      browser,
      page,
    }, testInfo) => {
      await collaborator(
        browser,
        page,
        uniqueEmail(testInfo, `qa117-c-${locale}`).replace('@example.test', ''),
        locale,
      );
      await page.goto('/jobs');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await hamburger(page).click();
      await expect(links(page)).toHaveText([copy.shell.nav.myApplications, copy.shell.nav.myJobs]);
      for (const link of await links(page).all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('a workspace switch from /candidates lands on /jobs, as on desktop, and closes nothing it should not', async ({
    page,
  }, testInfo) => {
    await admin(page, uniqueEmail(testInfo, 'qa117-switch'));
    await createWorkspace(page, 'Mây Studio');
    await page.goto('/candidates');
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');

    await page.getByTestId('workspace-menu-trigger').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    const panel = (await menu.boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(360);
    await menu.getByRole('menuitem', { name: 'An Nhiên' }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('workspace-menu-name')).toHaveText('An Nhiên');

    // Escape on the open account menu closes that menu only; the nav list stays closed.
    await page.getByTestId('account-menu-trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('account-menu-trigger')).toBeFocused();
    await expect(mobileNav(page)).toHaveCount(0);
  });

  test('after 360 -> 1024 -> 360 px with the list open, the top bar returns with the list closed', async ({
    page,
  }, testInfo) => {
    await admin(page, uniqueEmail(testInfo, 'qa117-resize'));
    await page.goto('/jobs');
    await hamburger(page).click();
    await expect(mobileNav(page)).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('app-top-bar')).toHaveCount(0);
    await expect(mobileNav(page)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('qa-mobile-nav-resized-1024.png') });

    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByTestId('app-top-bar')).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
    await expect(mobileNav(page)).toHaveCount(0);
    await expect(hamburger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the breakpoint sits at 768 px: top bar at 767 px, sidebar at 768 px', async ({
    page,
  }, testInfo) => {
    await admin(page, uniqueEmail(testInfo, 'qa117-breakpoint'));
    await page.setViewportSize({ width: 767, height: 800 });
    await page.goto('/jobs');
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();
    await expect(page.getByTestId('app-top-bar')).toBeVisible();
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0);

    await page.setViewportSize({ width: 768, height: 800 });
    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('app-top-bar')).toHaveCount(0);
  });
});
