// QA for issue #127: the jobs list at /jobs against the real API and the Compose Postgres. Covers what
// jobs-list.spec.ts leaves out: the vi then en copy and layout against Example · Desktop list (light
// and Example · Dark desktop), Example · Empty workspace and Example · Collaborator view with the
// issue's noted differences, the status options, the 300 ms debounce as one request, back/forward on
// the status filter, reload on page 2, the no-results state with "Xóa bộ lọc", the loading skeleton,
// the error notice with retry, keyboard reach of the controls and rows, status badges that carry text,
// a recruiter's create button and a collaborator in a workspace without any job. Screenshots at
// 1440 px light/dark and 360 px, in vi and en.
import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Status = 'draft' | 'open' | 'paused' | 'closed';
type Role = 'collaborator' | 'recruiter';

const DESIGN_JOBS: { title: string; status: Status }[] = [
  { title: 'Product Designer', status: 'open' },
  { title: 'Chuyên viên Phát triển Đối tác Doanh nghiệp Khu vực Đông Nam Á', status: 'open' },
  { title: 'Kỹ sư Frontend', status: 'draft' },
];

async function adminWorkspace(page: Page, email: string): Promise<string> {
  await signInAsNewUser(page, email);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  return createWorkspace(page, 'An Nhiên');
}

/** Inserts `jobs` (QA-001, …) owned by `email`, newest first; returns their ids in order. */
function seedJobs(workspaceId: string, email: string, jobs: { title: string; status: Status }[]) {
  const ids = jobs.map(() => randomUUID());
  const values = jobs
    .map(
      (job, i) =>
        `(${sqlString(ids[i]!)}::uuid, ${sqlString(`QA-${String(i + 1).padStart(3, '0')}`)}, ` +
        `${sqlString(job.title)}, ${sqlString(job.status)}, ${i})`,
    )
    .join(', ');
  psql(
    `insert into jobs (id, workspace_id, code, title, status, created_by, owner_user_id, created_at)
     select v.id, ${sqlString(workspaceId)}, v.code, v.title, v.status, u.id, u.id,
            now() - (v.n || ' seconds')::interval
     from (values ${values}) as v(id, code, title, status, n)
     cross join "user" u where u.email = ${sqlString(email)}`,
  );
  return ids;
}

async function member(
  browser: Browser,
  workspaceId: string,
  email: string,
  role: Role,
  jobIds: string[] = [],
): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'vi-VN' })).newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsNewUser(page, email);
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  for (const jobId of jobIds) {
    psql(
      `insert into job_assignments (job_id, user_id)
       select ${sqlString(jobId)}, id from "user" where email = ${sqlString(email)}`,
    );
  }
  psql(
    `update session set active_organization_id = ${sqlString(workspaceId)}
     where user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
  return page;
}

const rows = (page: Page) => page.getByTestId('jobs-table').locator('tbody tr');

async function setPreference(page: Page, name: string): Promise<void> {
  await page.goto('/settings/personal');
  const radio = page.getByRole('radio', { name, exact: true });
  const theme = {
    [vi.settings.personal.theme.dark]: 'dark',
    [vi.settings.personal.theme.light]: 'light',
  }[name];
  if (theme) {
    // The theme is kept in the browser.
    await radio.check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    return;
  }
  // The language is saved on the account; leave only once the API has answered.
  const saved = page.waitForResponse(
    (response) => response.request().method() !== 'GET' && response.url().includes('/api/'),
  );
  await radio.check();
  await expect(radio).toBeChecked();
  await saved;
}

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectListCopy(page: Page, copy: typeof vi): Promise<void> {
  const list = copy.jobs.list;
  const view = page.getByTestId('jobs-list-page');
  await expect(view.getByRole('heading', { level: 1 })).toHaveText(list.title);
  await expect(view).toContainText(list.description);
  await expect(view.getByRole('button', { name: list.create, exact: true })).toBeVisible();
  await expect(view.getByPlaceholder(list.searchPlaceholder)).toBeVisible();
  const status = view.getByLabel(list.statusLabel, { exact: true });
  await expect(status.locator('option')).toHaveText([
    list.statusAll,
    copy.jobs.status.draft,
    copy.jobs.status.open,
    copy.jobs.status.paused,
    copy.jobs.status.closed,
  ]);
  const heads = page.getByTestId('jobs-table').locator('thead th');
  await expect(heads).toHaveText([list.columns.position, list.columns.status, list.columns.owner], {
    ignoreCase: true,
  });
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText('Product Designer');
  await expect(rows(page).nth(0)).toContainText('QA-001');
  await expect(rows(page).nth(0).getByTestId('job-status')).toHaveText(copy.jobs.status.open);
  await expect(rows(page).nth(0).getByTestId('job-owner')).toHaveText('Minh Anh');
  await expect(rows(page).nth(2).getByTestId('job-status')).toHaveText(copy.jobs.status.draft);
}

test.describe('jobs list QA', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });
  // Each test signs up to three synthetic accounts; the whole suite runs them under load.
  test.describe.configure({ timeout: 90_000 });

  test('Example · Desktop list at 1440 px: vi light, vi dark, then en', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-design');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, DESIGN_JOBS);

    await page.goto('/jobs');
    await expectListCopy(page, vi);

    // Layout as drawn: create button top right of the header, toolbar below it, the table under
    // the toolbar, search before status, no "Địa điểm" filter (noted difference).
    const create = (await page.getByTestId('jobs-create').boundingBox())!;
    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const search = (await page.getByPlaceholder(vi.jobs.list.searchPlaceholder).boundingBox())!;
    const status = (await page.getByLabel(vi.jobs.list.statusLabel).boundingBox())!;
    const table = (await page.getByTestId('jobs-table').boundingBox())!;
    expect(create.x + create.width).toBeGreaterThan(1300);
    expect(Math.abs(create.y - h1.y)).toBeLessThan(40);
    expect(search.y).toBeGreaterThan(h1.y + h1.height);
    expect(status.x).toBeGreaterThan(search.x + search.width - 1);
    expect(Math.abs(status.y - search.y)).toBeLessThan(8);
    expect(table.y).toBeGreaterThan(search.y + search.height - 1);
    expect(search.x).toBeCloseTo(h1.x, -1);
    await expect(page.getByText('Địa điểm', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-light-1440.png') });

    await setPreference(page, vi.settings.personal.theme.dark);
    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-dark-1440.png') });

    await setPreference(page, vi.settings.personal.theme.light);
    await setPreference(page, vi.settings.personal.language.en);
    await page.goto('/jobs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectListCopy(page, en as unknown as typeof vi);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-en-light-1440.png') });
  });

  test('keyboard reaches search, status and every row; badges carry their status as text', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-keys');
    const workspaceId = await adminWorkspace(page, email);
    const ids = seedJobs(workspaceId, email, [
      { title: 'Kỹ sư Frontend', status: 'draft' },
      { title: 'Product Designer', status: 'open' },
      { title: 'Kế toán', status: 'paused' },
    ]);
    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(3);

    const search = page.getByPlaceholder(vi.jobs.list.searchPlaceholder);
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(vi.jobs.list.statusLabel)).toBeFocused();
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      await expect(rows(page).nth(i).getByRole('link')).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/jobs/${ids[1]}$`));
    await page.goBack();

    // The status select works from the keyboard and updates the URL.
    await page.getByLabel(vi.jobs.list.statusLabel).focus();
    await page.getByLabel(vi.jobs.list.statusLabel).selectOption('paused');
    await expect(page).toHaveURL(/[?&]status=paused$/);
    await expect(rows(page)).toHaveCount(1);
    await page.goto('/jobs');

    // Each badge is text, never colour alone; Draft and Closed share a tone but not a label.
    const badges = page.getByTestId('jobs-table').getByTestId('job-status');
    await expect(badges).toHaveText([
      vi.jobs.status.draft,
      vi.jobs.status.open,
      vi.jobs.status.paused,
    ]);
    // Focus is visible on a row link.
    await rows(page).first().getByRole('link').focus();
    const outline = await rows(page)
      .first()
      .getByRole('link')
      .evaluate((el) => {
        const s = getComputedStyle(el);
        const row = el.closest('tr')!;
        const r = getComputedStyle(row);
        return `${s.outlineStyle}|${s.boxShadow}|${r.outlineStyle}|${r.boxShadow}`;
      });
    expect(outline).not.toBe('none|none|none|none');
  });

  test('search is debounced into one request, and status/back/forward/reload keep the URL', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-url');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, [
      { title: 'Thiết kế sản phẩm', status: 'open' },
      { title: 'Kỹ sư Backend', status: 'draft' },
      { title: 'Kế toán', status: 'closed' },
    ]);
    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(2);

    // One request, sent at least 300 ms after the last keystroke (decisions §11).
    const searches: { search: string; at: number }[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/jobs' && url.searchParams.get('q')) {
        searches.push({ search: url.search, at: Date.now() });
      }
    });
    const box = page.getByPlaceholder(vi.jobs.list.searchPlaceholder);
    await box.evaluate((el) => {
      el.addEventListener('input', () => {
        (window as unknown as { lastInput: number }).lastInput = Date.now();
      });
    });
    await box.pressSequentially('thiet ke', { delay: 60 });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Thiết kế sản phẩm');
    const lastInput = await page.evaluate(
      () => (window as unknown as { lastInput: number }).lastInput,
    );
    expect(searches.map((entry) => entry.search)).toEqual(['?q=thiet+ke']);
    expect(searches[0]!.at - lastInput).toBeGreaterThanOrEqual(290);

    // Search by reference code too.
    await page.getByPlaceholder(vi.jobs.list.searchPlaceholder).fill('QA-002');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Kỹ sư Backend');
    await page.getByPlaceholder(vi.jobs.list.searchPlaceholder).fill('');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(rows(page)).toHaveCount(2);

    await page.getByLabel(vi.jobs.list.statusLabel).selectOption({ label: vi.jobs.status.closed });
    await expect(page).toHaveURL(/[?&]status=closed$/);
    await expect(rows(page)).toHaveCount(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByLabel(vi.jobs.list.statusLabel)).toHaveValue('active');
    await page.goForward();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Kế toán');
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByLabel(vi.jobs.list.statusLabel)).toHaveValue('closed');
  });

  test('page 2 survives a reload and shows 5 of 30', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-page');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(
      workspaceId,
      email,
      Array.from({ length: 30 }, (_, i) => ({ title: `Vị trí ${i + 1}`, status: 'open' as const })),
    );
    await page.goto('/jobs?page=2');
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByTestId('jobs-pagination')).toContainText('26–30 / 30');
    await page.reload();
    await expect(rows(page)).toHaveCount(5);
    await expect(page.getByTestId('jobs-page-next')).toBeDisabled();
    await page.getByTestId('jobs-page-previous').click();
    await expect(rows(page)).toHaveCount(25);
    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('no results offers "Xóa bộ lọc" (vi then en); loading shows skeleton rows; errors retry', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-states');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, DESIGN_JOBS);

    await page.goto('/jobs?q=khong-co-gi');
    const none = page.getByTestId('jobs-no-results');
    await expect(none.getByRole('heading', { level: 2 })).toHaveText(vi.jobs.list.noResults.title);
    await expect(none).toContainText(vi.jobs.list.noResults.description);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-no-results-1440.png') });
    await none.getByRole('button', { name: vi.jobs.list.noResults.action }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByPlaceholder(vi.jobs.list.searchPlaceholder)).toHaveValue('');

    // Loading: hold the list request and look for the skeleton.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/jobs?**', async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/jobs?status=draft');
    const loading = page.getByTestId('jobs-loading');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-loading-1440.png') });
    release();
    await expect(rows(page)).toHaveCount(1);
    await page.unroute('**/api/jobs?**');

    // Error, then retry.
    let fail = true;
    await page.route('**/api/jobs**', async (route) => {
      if (fail && new URL(route.request().url()).pathname === '/api/jobs') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      } else await route.continue();
    });
    await page.goto('/jobs');
    const error = page.getByTestId('jobs-error');
    await expect(error).toContainText(vi.jobs.list.error);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-error-1440.png') });
    fail = false;
    await error.getByRole('button', { name: vi.jobs.list.retry }).click();
    await expect(rows(page)).toHaveCount(3);
    await page.unroute('**/api/jobs**');

    await setPreference(page, vi.settings.personal.language.en);
    await page.goto('/jobs?q=nothing-here');
    await expect(none.getByRole('heading', { level: 2 })).toHaveText(en.jobs.list.noResults.title);
    await expect(none.getByRole('button', { name: en.jobs.list.noResults.action })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('jobs-list-en-no-results-1440.png') });
  });

  test('Example · Empty workspace for an admin (vi, en); a collaborator in an empty workspace', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-empty');
    const workspaceId = await adminWorkspace(page, email);
    await page.goto('/jobs');
    const empty = page.getByTestId('jobs-empty');
    await expect(empty.getByRole('heading', { level: 2 })).toHaveText(vi.jobs.list.empty.title);
    await expect(empty).toContainText(vi.jobs.list.empty.description);
    await expect(empty.getByRole('button', { name: vi.jobs.list.empty.action })).toBeVisible();
    await expect(page.getByPlaceholder(vi.jobs.list.searchPlaceholder)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-empty-1440.png') });

    // The empty workspace's "Tạo vị trí đầu tiên" is the empty state's; the header keeps "Tạo vị trí".
    await setPreference(page, vi.settings.personal.language.en);
    await page.goto('/jobs');
    await expect(empty.getByRole('heading', { level: 2 })).toHaveText(en.jobs.list.empty.title);
    await expect(empty.getByRole('button', { name: en.jobs.list.empty.action })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('jobs-list-en-empty-1440.png') });

    const other = await member(
      browser,
      workspaceId,
      uniqueEmail(testInfo, 'qa127-empty-c'),
      'collaborator',
    );
    await other.goto('/jobs');
    await expect(other.getByRole('heading', { level: 1 })).toHaveText(
      vi.jobs.list.titleCollaborator,
    );
    const collabEmpty = other.getByTestId('jobs-empty');
    await expect(collabEmpty.getByRole('heading', { level: 2 })).toHaveText(
      vi.jobs.list.emptyCollaborator.title,
    );
    await expect(collabEmpty).toContainText(vi.jobs.list.emptyCollaborator.description);
    await expect(other.getByRole('button', { name: /Tạo vị trí/ })).toHaveCount(0);
    await other.screenshot({
      path: testInfo.outputPath('jobs-list-vi-empty-collaborator-1440.png'),
    });
    await other.context().close();
  });

  test('Example · Collaborator view and a recruiter with the create button', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-roles');
    const workspaceId = await adminWorkspace(page, email);
    const ids = seedJobs(workspaceId, email, [
      ...DESIGN_JOBS,
      { title: 'Kế toán', status: 'open' },
    ]);

    const collab = await member(
      browser,
      workspaceId,
      uniqueEmail(testInfo, 'qa127-c'),
      'collaborator',
      [ids[0]!, ids[1]!, ids[2]!],
    );
    await collab.goto('/jobs');
    await expect(collab.getByRole('heading', { level: 1 })).toHaveText(
      vi.jobs.list.titleCollaborator,
    );
    await expect(collab.getByTestId('jobs-list-page')).toContainText(
      vi.jobs.list.descriptionCollaborator,
    );
    await expect(rows(collab)).toHaveCount(3);
    await expect(collab.getByTestId('jobs-table')).not.toContainText('Kế toán');
    await expect(
      collab.getByRole('button', { name: vi.jobs.list.create, exact: true }),
    ).toHaveCount(0);
    await collab.screenshot({ path: testInfo.outputPath('jobs-list-vi-collaborator-1440.png') });
    await collab.context().close();

    const recruiter = await member(
      browser,
      workspaceId,
      uniqueEmail(testInfo, 'qa127-r'),
      'recruiter',
    );
    await recruiter.goto('/jobs');
    await expect(recruiter.getByRole('heading', { level: 1 })).toHaveText(vi.jobs.list.title);
    await expect(
      recruiter.getByRole('button', { name: vi.jobs.list.create, exact: true }),
    ).toBeVisible();
    await recruiter.context().close();
  });

  test('360 px in vi and en: stacked rows, full-width toolbar, no sideways scroll', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa127-360');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, DESIGN_JOBS);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('jobs-table').locator('th:visible')).toHaveCount(1);
    const cell = rows(page).nth(1).locator('td').first();
    await expect(cell).toContainText('Đông Nam Á');
    await expect(cell).toContainText('QA-002');
    await expect(cell.getByText(vi.jobs.status.open)).toBeVisible();
    await expect(cell.getByText('Minh Anh')).toBeVisible();
    const search = (await page.getByPlaceholder(vi.jobs.list.searchPlaceholder).boundingBox())!;
    const status = (await page.getByLabel(vi.jobs.list.statusLabel).boundingBox())!;
    expect(status.y).toBeGreaterThan(search.y);
    expect(search.width).toBeGreaterThan(280);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-vi-360.png'), fullPage: true });

    await setPreference(page, vi.settings.personal.language.en);
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.jobs.list.title);
    await expect(
      rows(page).first().locator('td').first().getByText(en.jobs.status.open),
    ).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('jobs-list-en-360.png'), fullPage: true });
  });
});
