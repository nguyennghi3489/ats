// Issue #127: the jobs list at /jobs against the real API and the Compose Postgres. Each test signs
// a fresh synthetic admin up, creates the "An Nhiên" workspace through the API and seeds its jobs
// straight into Postgres (the create job dialog is a separate issue).
import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Status = 'draft' | 'open' | 'paused' | 'closed';

interface SeedJob {
  title: string;
  status?: Status;
}

/** Signs `email` in as the admin of a new "An Nhiên" workspace. Returns the workspace id. */
async function adminWorkspace(page: Page, email: string): Promise<string> {
  await signInAsNewUser(page, email);
  return createWorkspace(page, 'An Nhiên');
}

/** Inserts `jobs` (AN-001, AN-002, …) owned and created by `email`; returns their ids in order. */
function seedJobs(workspaceId: string, email: string, jobs: SeedJob[]): string[] {
  const ids = jobs.map(() => randomUUID());
  const values = jobs
    .map(
      (job, i) =>
        `(${sqlString(ids[i]!)}::uuid, ${sqlString(`AN-${String(i + 1).padStart(3, '0')}`)}, ` +
        `${sqlString(job.title)}, ${sqlString(job.status ?? 'draft')}, ${i})`,
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

/** Signs a new collaborator of `workspaceId` in, on a fresh browser context; assigns `jobIds`. */
async function collaborator(
  browser: Browser,
  workspaceId: string,
  email: string,
  jobIds: string[] = [],
): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'vi-VN' })).newPage();
  await signInAsNewUser(page, email);
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, 'collaborator', 'active'
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
const createButton = (page: Page) =>
  page.getByRole('button', { name: vi.jobs.list.create, exact: true });

test.describe('jobs list', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('hides Closed jobs by default and shows them through the status filter', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-status');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, [
      { title: 'Kỹ sư Frontend', status: 'draft' },
      { title: 'Product Designer', status: 'open' },
      { title: 'Kế toán', status: 'closed' },
    ]);

    await page.goto('/jobs');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.jobs.list.title);
    await expect(createButton(page)).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first()).toContainText('Kỹ sư Frontend');
    await expect(rows(page).first()).toContainText('AN-001');
    await expect(rows(page).first()).toContainText(vi.jobs.status.draft);
    // The closed select reads "Trạng thái: Tất cả", as drawn in the design.
    await expect(page.locator('[role="search"] .ats-select__value')).toHaveText(
      'Trạng thái: Tất cả',
    );

    await page.getByLabel(vi.jobs.list.statusLabel).selectOption({ label: vi.jobs.status.closed });

    await expect(page).toHaveURL(/[?&]status=closed$/);
    await expect(page.locator('[role="search"] .ats-select__value')).toHaveText(
      'Trạng thái: Đã đóng',
    );
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Kế toán');
  });

  test('searches without accents after the debounce, and a reload keeps the search', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-search');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, [
      { title: 'Thiết kế sản phẩm', status: 'open' },
      { title: 'Kỹ sư Backend', status: 'open' },
    ]);
    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(2);

    await page.getByPlaceholder(vi.jobs.list.searchPlaceholder).fill('thiet ke');

    await expect(page).toHaveURL(/[?&]q=thiet(%20|\+)ke/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Thiết kế sản phẩm');

    await page.reload();
    await expect(page.getByPlaceholder(vi.jobs.list.searchPlaceholder)).toHaveValue('thiet ke');
    await expect(rows(page)).toHaveCount(1);
  });

  test('an empty workspace offers the first job to an admin, not to a collaborator', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-empty');
    const workspaceId = await adminWorkspace(page, email);

    await page.goto('/jobs');
    const empty = page.getByTestId('jobs-empty');
    await expect(empty.getByRole('heading', { level: 2 })).toHaveText(vi.jobs.list.empty.title);
    await expect(empty.getByRole('button', { name: vi.jobs.list.empty.action })).toBeVisible();

    seedJobs(workspaceId, email, [{ title: 'Product Designer', status: 'open' }]);
    const other = await collaborator(
      browser,
      workspaceId,
      uniqueEmail(testInfo, 'e2e127-empty-collab'),
    );
    await other.goto('/jobs');
    const collabEmpty = other.getByTestId('jobs-empty');
    await expect(collabEmpty.getByRole('heading', { level: 2 })).toHaveText(
      vi.jobs.list.emptyCollaborator.title,
    );
    await expect(other.getByRole('button', { name: /Tạo vị trí/ })).toHaveCount(0);
    await other.context().close();
  });

  test('a collaborator sees "Vị trí của tôi" with only their jobs and no create button', async ({
    browser,
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-collab-admin');
    const workspaceId = await adminWorkspace(page, email);
    const [assigned] = seedJobs(workspaceId, email, [
      { title: 'Product Designer', status: 'open' },
      { title: 'Kỹ sư Frontend', status: 'open' },
    ]);

    const other = await collaborator(browser, workspaceId, uniqueEmail(testInfo, 'e2e127-collab'), [
      assigned!,
    ]);
    await other.goto('/jobs');

    await expect(other.getByRole('heading', { level: 1 })).toHaveText(
      vi.jobs.list.titleCollaborator,
    );
    await expect(rows(other)).toHaveCount(1);
    await expect(rows(other).first()).toContainText('Product Designer');
    await expect(createButton(other)).toHaveCount(0);
    await other.context().close();
  });

  test('pages 25 at a time: with 30 jobs page 2 shows 5 rows', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-paging');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(
      workspaceId,
      email,
      Array.from({ length: 30 }, (_, i) => ({ title: `Vị trí ${i + 1}`, status: 'open' as const })),
    );

    await page.goto('/jobs');
    await expect(rows(page)).toHaveCount(25);

    await page.getByRole('button', { name: vi.jobs.list.pagination.next }).click();

    await expect(page).toHaveURL(/[?&]page=2$/);
    await expect(rows(page)).toHaveCount(5);
    await page.goBack();
    await expect(rows(page)).toHaveCount(25);
  });

  test('a row opens its job page, by click and by keyboard', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e127-row');
    const workspaceId = await adminWorkspace(page, email);
    const [first, second] = seedJobs(workspaceId, email, [
      { title: 'Product Designer', status: 'open' },
      { title: 'Kỹ sư Frontend', status: 'draft' },
    ]);
    await page.goto('/jobs');

    // The owner cell: anywhere on the row leads to the job, not only the title link.
    await expect(rows(page).first().locator('td').nth(2)).toHaveText('QA Tester');
    await rows(page).first().locator('td').nth(2).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${first}$`));

    await page.goBack();
    await rows(page).nth(1).getByRole('link').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/jobs/${second}$`));
  });

  test('is usable at 360 px: rows stack and the page never scrolls sideways', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const email = uniqueEmail(testInfo, 'e2e127-mobile');
    const workspaceId = await adminWorkspace(page, email);
    seedJobs(workspaceId, email, [
      { title: 'Chuyên viên Phát triển Đối tác Doanh nghiệp Khu vực Đông Nam Á', status: 'open' },
    ]);

    await page.goto('/jobs');

    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('jobs-table').locator('th:visible')).toHaveCount(1);
    // Title, code, status and owner stack in the one visible cell.
    const cell = rows(page).first().locator('td').first();
    await expect(cell).toContainText('AN-001');
    await expect(cell.getByText(vi.jobs.status.open)).toBeVisible();
    await expect(cell.getByText('QA Tester')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
