// QA for issue #129: the job page header and tabs in a real browser against the Compose stack.
// Covers what job-page.spec.ts does not: vi then en copy, a hidden job and a non-uuid id looking
// exactly like a missing one, a job of the user's other workspace, the collaborator breadcrumb,
// tab links and keyboard order, deep links and back/forward, the loading skeleton, switching jobs,
// and screenshots at 1440 px (light and dark) and 360 px to compare with the design screen.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Copy = typeof vi;
const tabNames = (copy: Copy) => [
  copy.jobs.tabs.applications,
  copy.jobs.tabs.plan,
  copy.jobs.tabs.content,
  copy.jobs.tabs.stages,
  copy.jobs.tabs.team,
];

function seedJob(
  workspaceId: string,
  email: string,
  options: { code?: string; title?: string; status?: string; accessScope?: string } = {},
): string {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, status, access_scope, created_by, owner_user_id)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, ${sqlString(options.code ?? 'AN-001')},
       ${sqlString(options.title ?? 'Product Designer')}, ${sqlString(options.status ?? 'draft')},
       ${sqlString(options.accessScope ?? 'normal')}, id, id
     from "user" where email = ${sqlString(email)}`,
  );
  return id;
}

/** Adds `email` (already signed up) to `workspaceId` with `role` and makes it their active one. */
function joinWorkspace(workspaceId: string, email: string, role: string) {
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  psql(
    `update session set active_organization_id = ${sqlString(workspaceId)}
     where user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
}

const tabs = (page: Page) => page.getByTestId('job-tabs').getByRole('tab');

async function adminWithJob(page: Page, email: string, locale: 'vi' | 'en' = 'vi') {
  await signInAsNewUser(page, email, locale);
  const workspaceId = await createWorkspace(page, 'An Nhiên');
  return { workspaceId, jobId: seedJob(workspaceId, email) };
}

test.describe('job page (QA #129)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  for (const [lang, copy] of [
    ['vi', vi],
    ['en', en],
  ] as const) {
    test(`header, tabs and unavailable state read in ${lang}`, async ({ page }, testInfo) => {
      const email = uniqueEmail(testInfo, `qa129-copy-${lang}`);
      const { jobId } = await adminWithJob(page, email, lang);

      await page.goto(`/jobs/${jobId}`);

      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const crumbs = page.getByTestId('job-breadcrumb');
      await expect(crumbs).toHaveAttribute('aria-label', copy.jobs.header.breadcrumb);
      await expect(crumbs.getByRole('link')).toHaveText(copy.shell.nav.jobs);
      await expect(crumbs.getByRole('listitem').last()).toHaveText('Product Designer');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
      await expect(page.getByTestId('job-code')).toHaveText(
        copy.jobs.header.code.replace('{code}', 'AN-001'),
      );
      await expect(page.getByTestId('job-status')).toHaveText(copy.jobs.status.draft);
      await expect(page.getByRole('tablist', { name: copy.jobs.tabs.label })).toBeVisible();
      await expect(tabs(page)).toHaveText(tabNames(copy));
      await expect(page.getByRole('tab', { name: copy.jobs.tabs.applications })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Out of v1: no publishing tab or badge in either language.
      for (const text of ['Đăng tuyển', 'Chưa công khai', 'Publishing', 'Not published']) {
        await expect(page.getByText(text, { exact: true })).toHaveCount(0);
      }
      // The header actions slot holds "Thao tác tuyển dụng" for an admin since #130.
      await expect(
        page.getByRole('button', { name: copy.jobs.status.actions.trigger }),
      ).toHaveCount(1);
      // Only one h1 on the page: the tab placeholder uses h2.
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.screenshot({ path: testInfo.outputPath(`job-page-1440-${lang}.png`) });

      await page.goto(`/jobs/${randomUUID()}`);
      const state = page.getByTestId('job-unavailable');
      await expect(state.getByRole('heading', { level: 1 })).toHaveText(copy.jobs.header.notFound);
      await expect(state.getByRole('link', { name: copy.jobs.header.backToList })).toHaveAttribute(
        'href',
        '/jobs',
      );
      await page.screenshot({ path: testInfo.outputPath(`job-unavailable-${lang}.png`) });
    });
  }

  test('each tab is a link with its own URL; deep links, back and forward keep the tab', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-links'));
    const base = `/jobs/${jobId}`;

    await page.goto(base);
    await expect(tabs(page)).toHaveCount(5);
    const hrefs = await tabs(page).evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(hrefs).toEqual([
      `${base}/applications`,
      `${base}/plan`,
      `${base}/content`,
      `${base}/stages`,
      `${base}/team`,
    ]);

    for (const [slug, name] of [
      ['plan', vi.jobs.tabs.plan],
      ['content', vi.jobs.tabs.content],
      ['team', vi.jobs.tabs.team],
      ['applications', vi.jobs.tabs.applications],
    ] as const) {
      await page.goto(`${base}/${slug}`);
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }

    await page.goto(base);
    await page.getByRole('tab', { name: vi.jobs.tabs.content }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/content$`));
    await page.getByRole('tab', { name: vi.jobs.tabs.stages }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/stages$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${base}/content$`));
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.content })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goForward();
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.stages })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByTestId('job-breadcrumb').getByRole('link').click();
    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('tabs are keyboard-navigable: one Tab stop, arrows, Home and End change the URL', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-keys'));
    const base = `/jobs/${jobId}`;
    await page.goto(base);
    await expect(tabs(page)).toHaveCount(5);

    const tabIndexes = await tabs(page).evaluateAll((els) => els.map((el) => el.tabIndex));
    expect(tabIndexes).toEqual([0, -1, -1, -1, -1]);

    await page.getByRole('tab', { name: vi.jobs.tabs.applications }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.plan })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${base}/plan$`));

    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.team })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${base}/team$`));

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.applications })).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${base}/applications$`));

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.team })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.applications })).toBeFocused();

    // Tab order: breadcrumb link, "Thao tác tuyển dụng" (#130), then the tab row as a single stop.
    await page.getByTestId('job-breadcrumb').getByRole('link').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: vi.jobs.status.actions.trigger })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.applications })).toBeFocused();
  });

  test('a hidden restricted job, a non-uuid id and a missing one look exactly the same', async ({
    page,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa129-hide-admin');
    await signInAsNewUser(page, adminEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const hiddenId = seedJob(workspaceId, adminEmail, { accessScope: 'restricted' });
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'qa129-hide-recruiter');
    await signInAsNewUser(page, email);
    joinWorkspace(workspaceId, email, 'recruiter');

    const texts: string[] = [];
    for (const id of [hiddenId, randomUUID(), 'not-a-uuid']) {
      await page.goto(`/jobs/${id}`);
      const state = page.getByTestId('job-unavailable');
      await expect(state.getByRole('heading', { level: 1 })).toHaveText(vi.jobs.header.notFound);
      await expect(page.getByTestId('job-header')).toHaveCount(0);
      texts.push(await state.innerText());
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[2]).toBe(texts[1]);
    await expect(page.getByText('Product Designer')).toHaveCount(0);
  });

  test("a job of the user's other workspace is unavailable while another one is active", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa129-two-ws');
    await signInAsNewUser(page, email);
    const first = await createWorkspace(page, 'An Nhiên');
    const foreignJob = seedJob(first, email, { title: 'Kế toán trưởng', code: 'AN-007' });
    await createWorkspace(page, 'Hải Đăng Labs'); // now the active one

    await page.goto(`/jobs/${foreignJob}`);

    await expect(page.getByTestId('job-unavailable').getByRole('heading', { level: 1 })).toHaveText(
      vi.jobs.header.notFound,
    );
    await expect(page.getByText('Kế toán trưởng')).toHaveCount(0);
  });

  test('a collaborator sees "Vị trí của tôi" in the breadcrumb and no team tab link', async ({
    page,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa129-c-admin');
    await signInAsNewUser(page, adminEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const jobId = seedJob(workspaceId, adminEmail, { status: 'open' });
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'qa129-c-collab');
    await signInAsNewUser(page, email);
    joinWorkspace(workspaceId, email, 'collaborator');
    psql(
      `insert into job_assignments (job_id, user_id)
       select ${sqlString(jobId)}, id from "user" where email = ${sqlString(email)}`,
    );

    await page.goto(`/jobs/${jobId}/stages`);
    await expect(page.getByTestId('job-breadcrumb').getByRole('link')).toHaveText(
      vi.shell.nav.myJobs,
    );
    await expect(page.getByTestId('job-status')).toHaveText(vi.jobs.status.open);
    await expect(tabs(page)).toHaveText(tabNames(vi).slice(0, 4));
    await expect(page.locator(`a[href$="/jobs/${jobId}/team"]`)).toHaveCount(0);
    await page.getByRole('tab', { name: vi.jobs.tabs.stages }).focus();
    await page.keyboard.press('End');
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/stages$`));
  });

  test('shows a loading skeleton while the header loads', async ({ page }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-loading'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/jobs/${jobId}`, async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto(`/jobs/${jobId}`);

    const skeleton = page.getByTestId('job-loading');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    await expect(skeleton).toHaveAttribute('aria-label', vi.jobs.header.loading);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('job-loading-1440.png') });
    release();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    await expect(skeleton).toHaveCount(0);
  });

  test('moving from one job to another reloads the header', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa129-switch');
    const { workspaceId, jobId } = await adminWithJob(page, email);
    const other = seedJob(workspaceId, email, {
      code: 'AN-002',
      title: 'Kỹ sư phần mềm',
      status: 'paused',
    });

    await page.goto(`/jobs/${jobId}/plan`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/jobs/${other}/plan`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kỹ sư phần mềm');
    await expect(page.getByTestId('job-code')).toHaveText('Mã tham chiếu: AN-002');
    await expect(page.getByTestId('job-status')).toHaveText(vi.jobs.status.paused);
    await expect(page.getByRole('tab', { name: vi.jobs.tabs.plan })).toHaveAttribute(
      'href',
      `/jobs/${other}/plan`,
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`1440 px ${colorScheme} screenshot for the design comparison`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, `qa129-${colorScheme}`));
      psql(`update jobs set status = 'open' where id = ${sqlString(jobId)}`);

      await page.goto(`/jobs/${jobId}`);

      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await expect(page.getByTestId('job-status')).toHaveText(vi.jobs.status.open);
      const header = page.getByTestId('job-header');
      const box = await header.boundingBox();
      // Header sits right of the 224 px sidebar, inset 32 px; title under the breadcrumb.
      expect(box?.x).toBeGreaterThanOrEqual(220);
      const title = await page.getByRole('heading', { level: 1 }).boundingBox();
      const crumb = await page.getByTestId('job-breadcrumb').boundingBox();
      expect(title && crumb && title.y > crumb.y).toBe(true);
      await expect(tabs(page)).toHaveCount(5);
      expect(title && box && Math.round(title.x - box.x)).toBe(32);
      // The selected tab's indicator is visible and tab labels sit on one row.
      const ys = await tabs(page).evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().y)),
      );
      expect(new Set(ys).size).toBe(1);
      await page.screenshot({ path: testInfo.outputPath(`job-page-1440-${colorScheme}.png`) });
    });
  }

  test('the sidebar keeps "Vị trí tuyển dụng" selected on the job page, as in the design', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-nav'));

    for (const path of [`/jobs/${jobId}`, `/jobs/${jobId}/stages`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
      // Design 02 · App shell, Example · Record · Product Designer: the jobs item has the selected fill.
      await expect(
        page.getByTestId('app-sidebar').getByRole('link', { name: vi.shell.nav.jobs, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('the selected sidebar item on the job page has the selected fill, unlike the others', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-nav-fill'));

    await page.goto(`/jobs/${jobId}/plan`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    const sidebar = page.getByTestId('app-sidebar');
    const jobs = sidebar.getByRole('link', { name: vi.shell.nav.jobs, exact: true });
    const candidates = sidebar.getByRole('link', { name: vi.shell.nav.candidates, exact: true });
    await expect(jobs).toHaveAttribute('aria-current', 'page');
    await expect(candidates).not.toHaveAttribute('aria-current', 'page');
    const fill = (el: Element) => getComputedStyle(el).backgroundColor;
    expect(await jobs.evaluate(fill)).not.toBe(await candidates.evaluate(fill));
  });

  test('a collaborator keeps "Vị trí của tôi" selected in the sidebar on the job page', async ({
    page,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa129-navc-admin');
    await signInAsNewUser(page, adminEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const jobId = seedJob(workspaceId, adminEmail);
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'qa129-navc-collab');
    await signInAsNewUser(page, email);
    joinWorkspace(workspaceId, email, 'collaborator');
    psql(
      `insert into job_assignments (job_id, user_id)
       select ${sqlString(jobId)}, id from "user" where email = ${sqlString(email)}`,
    );

    for (const path of [`/jobs/${jobId}`, `/jobs/${jobId}/content`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
      await expect(
        page
          .getByTestId('app-sidebar')
          .getByRole('link', { name: vi.shell.nav.myJobs, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
    // The team URL sends the collaborator back to the job, still with the item selected.
    await page.goto(`/jobs/${jobId}/team`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));
    await expect(
      page.getByTestId('app-sidebar').getByRole('link', { name: vi.shell.nav.myJobs, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('360 px: header readable, every tab reachable by scrolling the tab row', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, uniqueEmail(testInfo, 'qa129-360'));
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('job-code')).toBeInViewport();
    await expect(page.getByTestId('job-status')).toBeInViewport();
    const team = page.getByRole('tab', { name: vi.jobs.tabs.team });
    await team.scrollIntoViewIfNeeded();
    await expect(team).toBeInViewport();
    await team.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/team$`));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('job-page-360.png'), fullPage: true });
  });
});
