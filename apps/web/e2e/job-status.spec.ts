// Issue #130: "Thao tác tuyển dụng" against the real API and the Compose Postgres. Each test signs a
// fresh synthetic admin up, creates the "An Nhiên" workspace through the API and seeds a draft job
// with the four default stages straight into Postgres (the create-job API is a separate issue).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const STAGES = ['Ứng tuyển', 'Sàng lọc', 'Phỏng vấn', 'Đề nghị'];

/** Signs `email` in as the admin of a new "An Nhiên" workspace. Returns the workspace id. */
async function adminWorkspace(page: Page, email: string): Promise<string> {
  await signInAsNewUser(page, email);
  return createWorkspace(page, 'An Nhiên');
}

/** Inserts the draft job AN-001 created by `email`, with four active stages; returns its id. */
function seedDraftJob(workspaceId: string, email: string): string {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, created_by, owner_user_id)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, 'AN-001', 'Product Designer', id, id
     from "user" where email = ${sqlString(email)}`,
  );
  psql(
    `insert into job_stages (job_id, name, position) values ${STAGES.map(
      (name, position) => `(${sqlString(id)}, ${sqlString(name)}, ${position})`,
    ).join(', ')}`,
  );
  return id;
}

/** Ids of the jobs `GET /api/jobs` lists with its default filter, as the signed-in user. */
async function defaultListIds(page: Page): Promise<string[]> {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/jobs', { credentials: 'include' });
    return {
      status: response.status,
      body: (await response.json()) as { items?: { id: string }[] },
    };
  });
  expect(result.status).toBe(200);
  return (result.body.items ?? []).map((item) => item.id);
}

const trigger = (page: Page) => page.getByRole('button', { name: vi.jobs.status.actions.trigger });
const badge = (page: Page) => page.getByTestId('job-status');

/** Opens "Thao tác tuyển dụng", checks it lists exactly `items`, and picks `label`. */
async function choose(page: Page, items: string[], label: string): Promise<void> {
  await trigger(page).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText(items);
  await menu.getByRole('menuitem', { name: label, exact: true }).click();
}

test.describe('job status', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('an admin opens, pauses, closes after confirming and reopens a job; the badge follows', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'e2e130-admin');
    const jobId = seedDraftJob(await adminWorkspace(page, email), email);
    const { actions } = vi.jobs.status;

    await page.goto(`/jobs/${jobId}`);
    await expect(badge(page)).toHaveText(vi.jobs.status.draft);

    await choose(page, [actions.open], actions.open);
    await expect(badge(page)).toHaveText(vi.jobs.status.open);

    await choose(page, [actions.pause, actions.close], actions.pause);
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);

    // Escape cancels the close: the dialog goes away and nothing changes.
    await choose(page, [actions.resume, actions.close], actions.close);
    const dialog = page.getByRole('dialog', { name: actions.closeConfirm.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(actions.closeConfirm.body);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);
    expect(await defaultListIds(page)).toContain(jobId);

    await choose(page, [actions.resume, actions.close], actions.close);
    await dialog.getByRole('button', { name: actions.closeConfirm.confirm }).click();
    await expect(dialog).toHaveCount(0);
    await expect(badge(page)).toHaveText(vi.jobs.status.closed);
    expect(await defaultListIds(page)).not.toContain(jobId);

    await choose(page, [actions.reopen], actions.reopen);
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
    expect(await defaultListIds(page)).toContain(jobId);

    // The page loaded fresh shows what the API stored.
    await page.reload();
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
  });

  test('a collaborator assigned to the job sees no "Thao tác tuyển dụng" button', async ({
    page,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'e2e130-owner');
    const workspaceId = await adminWorkspace(page, adminEmail);
    const jobId = seedDraftJob(workspaceId, adminEmail);
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'e2e130-collab');
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

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Product Designer');
    await expect(badge(page)).toHaveText(vi.jobs.status.draft);
    await expect(trigger(page)).toHaveCount(0);
    await expect(page.getByTestId('job-status-trigger')).toHaveCount(0);
  });
});
