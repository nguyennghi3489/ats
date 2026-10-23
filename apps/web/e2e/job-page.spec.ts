// Issue #129: the job page (header and tabs) against the real API and the Compose Postgres. Each
// test signs a fresh synthetic admin up, creates the "An Nhiên" workspace through the API and seeds
// its draft job AN-001 straight into Postgres (the jobs list and create API are separate issues).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const TABS = ['Ứng tuyển', 'Kế hoạch', 'Nội dung', 'Quy trình', 'Nhóm & quyền truy cập'];

/** Signs `email` in as the admin of a new "An Nhiên" workspace. Returns the workspace id. */
async function adminWorkspace(page: Page, email: string): Promise<string> {
  await signInAsNewUser(page, email);
  return createWorkspace(page, 'An Nhiên');
}

/** Inserts the draft job AN-001 "Product Designer" created by `email`; returns its id. */
function seedJob(workspaceId: string, email: string): string {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, created_by, owner_user_id)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, 'AN-001', 'Product Designer', id, id
     from "user" where email = ${sqlString(email)}`,
  );
  return id;
}

const tabs = (page: Page) => page.getByTestId('job-tabs').getByRole('tab');

test.describe('job page', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('shows the title, reference code, draft badge and the five tabs', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e129-header');
    const workspaceId = await adminWorkspace(page, email);
    const jobId = seedJob(workspaceId, email);

    await page.goto(`/jobs/${jobId}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    await expect(page.getByTestId('job-code')).toHaveText('Mã tham chiếu: AN-001');
    await expect(page.getByTestId('job-status')).toHaveText(vi.jobs.status.draft);
    await expect(tabs(page)).toHaveText(TABS);
    await expect(page.getByText('Đăng tuyển')).toHaveCount(0);
    await expect(page.getByText('Chưa công khai')).toHaveCount(0);
    await expect(page.getByTestId('job-breadcrumb').getByRole('link')).toHaveAttribute(
      'href',
      '/jobs',
    );
  });

  test('clicking Quy trình opens /jobs/:id/stages, and a reload keeps the tab', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e129-tabs');
    const jobId = seedJob(await adminWorkspace(page, email), email);
    await page.goto(`/jobs/${jobId}`);

    await tabs(page).filter({ hasText: 'Quy trình' }).click();

    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/stages$`));
    const stages = page.getByRole('tab', { name: 'Quy trình' });
    await expect(stages).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/stages$`));
    await expect(stages).toHaveAttribute('aria-selected', 'true');
  });

  test('a collaborator does not get the team tab, and /team sends them to the job', async ({
    page,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'e2e129-admin');
    const workspaceId = await adminWorkspace(page, adminEmail);
    const jobId = seedJob(workspaceId, adminEmail);
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'e2e129-collab');
    await signInAsNewUser(page, email);
    psql(
      `insert into member (id, organization_id, user_id, role, status)
       select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, 'collaborator', 'active'
       from "user" where email = ${sqlString(email)}`,
    );
    psql(
      `insert into job_assignments (job_id, user_id)
       select ${sqlString(jobId)}, id from "user" where email = ${sqlString(email)}`,
    );
    psql(
      `update session set active_organization_id = ${sqlString(workspaceId)}
       where user_id = (select id from "user" where email = ${sqlString(email)})`,
    );

    await page.goto(`/jobs/${jobId}`);
    await expect(tabs(page)).toHaveText(TABS.slice(0, 4));

    await page.goto(`/jobs/${jobId}/team`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));
    await expect(page.getByRole('tab', { name: 'Ứng tuyển' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a random uuid shows the unavailable state with a link back to the list', async ({
    page,
  }, testInfo) => {
    await adminWorkspace(page, uniqueEmail(testInfo, 'e2e129-missing'));

    await page.goto(`/jobs/${randomUUID()}`);

    const state = page.getByTestId('job-unavailable');
    await expect(state.getByRole('heading', { level: 1 })).toHaveText(vi.jobs.header.notFound);
    await state.getByRole('link', { name: vi.jobs.header.backToList }).click();
    await expect(page).toHaveURL(/\/jobs$/);
  });

  test('is usable at 360 px: no page scroll sideways, the tab row scrolls instead', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e129-mobile');
    const jobId = seedJob(await adminWorkspace(page, email), email);
    await page.setViewportSize({ width: 360, height: 780 });

    await page.goto(`/jobs/${jobId}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('job-tabs')).toHaveCSS('overflow-x', 'auto');
    await expect(page.getByTestId('job-tabs')).toHaveCSS('flex-wrap', 'nowrap');
  });
});
