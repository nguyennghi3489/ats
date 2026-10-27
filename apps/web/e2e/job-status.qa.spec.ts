// QA for issue #130: "Thao tác tuyển dụng" in a real browser against the Compose stack. Covers what
// job-status.spec.ts does not: the whole lifecycle with the keyboard only (Tab, Enter, Space, arrows,
// End, Escape cancelling the close), en copy of every item and of the close confirmation, the
// translated JOB_VERSION_STALE notice with "Tải lại", the JOB_NOT_READY notice, a recruiter on an
// assigned restricted job, and screenshots at 1440 px (light and dark) and 360 px to compare with the
// design screen "Example · Record · Product Designer". Data is synthetic; set COMPOSE_PROJECT_NAME to
// the QA Compose project so `psql` writes to its database.
import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Copy = typeof vi;
const STAGES = ['Ứng tuyển', 'Sàng lọc', 'Phỏng vấn', 'Đề nghị'];

function seedJob(
  workspaceId: string,
  email: string,
  options: { status?: string; accessScope?: string; retired?: boolean } = {},
): string {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, status, access_scope, created_by, owner_user_id)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, 'AN-001', 'Product Designer',
       ${sqlString(options.status ?? 'draft')}, ${sqlString(options.accessScope ?? 'normal')}, id, id
     from "user" where email = ${sqlString(email)}`,
  );
  psql(
    `insert into job_stages (job_id, name, position, retired_at) values ${STAGES.map(
      (name, position) =>
        `(${sqlString(id)}, ${sqlString(name)}, ${position}, ${options.retired ? 'now()' : 'null'})`,
    ).join(', ')}`,
  );
  return id;
}

async function adminWithJob(
  page: Page,
  testInfo: TestInfo,
  locale: 'vi' | 'en' = 'vi',
  options: { status?: string; retired?: boolean } = {},
) {
  const email = uniqueEmail(testInfo, 'qa130');
  await signInAsNewUser(page, email, locale);
  const workspaceId = await createWorkspace(page, 'An Nhiên');
  return { email, workspaceId, jobId: seedJob(workspaceId, email, options) };
}

const trigger = (page: Page, copy: Copy = vi) =>
  page.getByRole('button', { name: copy.jobs.status.actions.trigger });
const badge = (page: Page) => page.getByTestId('job-status');
const menuItems = (page: Page) => page.getByRole('menu').getByRole('menuitem');

/** Presses Tab until `target` has focus (at most 60 times), proving it is reachable by keyboard. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('target never received focus with Tab');
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.QA_SHOT_DIR;
  const path = dir ? `${dir}/${name}.png` : testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('job status (QA #130)', () => {
  test.use({ locale: 'vi-VN', viewport: { width: 1440, height: 900 } });

  test('keyboard only: open, pause, Escape cancels the close, close, reopen', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, testInfo);
    const { actions } = vi.jobs.status;
    await page.goto(`/jobs/${jobId}`);
    await expect(badge(page)).toHaveText(vi.jobs.status.draft);

    // Draft: Tab to the trigger, Enter opens on the first item, Enter picks it.
    await tabTo(page, trigger(page));
    await page.keyboard.press('Enter');
    await expect(menuItems(page)).toHaveText([actions.open]);
    await expect(menuItems(page).first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
    await expect(page.getByRole('menu')).toHaveCount(0);

    // Open: Arrow Down opens on "Tạm dừng".
    await tabTo(page, trigger(page));
    await page.keyboard.press('ArrowDown');
    await expect(menuItems(page)).toHaveText([actions.pause, actions.close]);
    await expect(menuItems(page).first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);

    // Paused: Space opens, End moves to "Đóng vị trí", Enter asks; focus starts on "Hủy".
    await tabTo(page, trigger(page));
    await page.keyboard.press(' ');
    await expect(menuItems(page)).toHaveText([actions.resume, actions.close]);
    await page.keyboard.press('End');
    await expect(menuItems(page).last()).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: actions.closeConfirm.title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(actions.closeConfirm.body);
    await expect(dialog.getByRole('button', { name: vi.common.cancel })).toBeFocused();
    await shot(page, testInfo, 'qa130-vi-1440-close-dialog');

    // Escape cancels: nothing changes and focus goes back to the page.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);

    // Again, this time Tab to "Đóng vị trí" in the dialog and confirm with Enter.
    await tabTo(page, trigger(page));
    await page.keyboard.press('ArrowUp');
    await expect(menuItems(page).last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: actions.closeConfirm.confirm });
    await tabTo(page, confirm);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(badge(page)).toHaveText(vi.jobs.status.closed);

    // Closed: "Mở lại" with the keyboard.
    await tabTo(page, trigger(page));
    await page.keyboard.press('Enter');
    await expect(menuItems(page)).toHaveText([actions.reopen]);
    await page.keyboard.press('Enter');
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
  });

  test('a stale version shows the translated notice with "Tải lại", which loads the job again', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, testInfo, 'vi', { status: 'open' });
    await page.goto(`/jobs/${jobId}`);
    await expect(badge(page)).toHaveText(vi.jobs.status.open);

    // Someone else pauses the job after the page loaded.
    psql(`update jobs set status = 'paused', version = version + 1 where id = ${sqlString(jobId)}`);

    await trigger(page).click();
    await page.getByRole('menuitem', { name: vi.jobs.status.actions.pause, exact: true }).click();
    const notice = page.getByTestId('job-status-error');
    await expect(notice).toContainText(vi.errors.JOB_VERSION_STALE);
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
    await shot(page, testInfo, 'qa130-vi-1440-stale');

    await notice.getByRole('button', { name: vi.jobs.status.actions.reload }).click();
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);
    await expect(page.getByTestId('job-status-error')).toHaveCount(0);

    // The reloaded version works.
    await trigger(page).click();
    await expect(menuItems(page)).toHaveText([
      vi.jobs.status.actions.resume,
      vi.jobs.status.actions.close,
    ]);
    await page.getByRole('menuitem', { name: vi.jobs.status.actions.resume }).click();
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
  });

  test('opening a Draft whose stages are all retired shows the JOB_NOT_READY notice', async ({
    page,
  }, testInfo) => {
    const { jobId } = await adminWithJob(page, testInfo, 'vi', { retired: true });
    await page.goto(`/jobs/${jobId}`);
    await trigger(page).click();
    await page.getByRole('menuitem', { name: vi.jobs.status.actions.open }).click();
    await expect(page.getByTestId('job-status-error')).toContainText(vi.errors.JOB_NOT_READY);
    await expect(page.getByTestId('job-status-reload')).toHaveCount(0);
    await expect(badge(page)).toHaveText(vi.jobs.status.draft);
  });

  test('a recruiter assigned to a restricted job sees and uses the menu', async ({
    page,
  }, testInfo) => {
    const ownerEmail = uniqueEmail(testInfo, 'qa130-owner');
    await signInAsNewUser(page, ownerEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const jobId = seedJob(workspaceId, ownerEmail, { status: 'open', accessScope: 'restricted' });
    await page.context().clearCookies();

    const email = uniqueEmail(testInfo, 'qa130-recruiter');
    await signInAsNewUser(page, email);
    psql(
      `insert into member (id, organization_id, user_id, role, status)
       select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, 'recruiter', 'active'
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
    await trigger(page).click();
    await page.getByRole('menuitem', { name: vi.jobs.status.actions.pause }).click();
    await expect(badge(page)).toHaveText(vi.jobs.status.paused);
  });

  test('screens at 1440 px light and dark and 360 px, vi', async ({ page }, testInfo) => {
    const { jobId } = await adminWithJob(page, testInfo, 'vi', { status: 'open' });
    await page.goto(`/jobs/${jobId}`);
    await expect(badge(page)).toHaveText(vi.jobs.status.open);
    await shot(page, testInfo, 'qa130-vi-1440-light');
    await trigger(page).click();
    await expect(menuItems(page)).toHaveText([
      vi.jobs.status.actions.pause,
      vi.jobs.status.actions.close,
    ]);
    await shot(page, testInfo, 'qa130-vi-1440-light-menu');
    await page.keyboard.press('Escape');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await trigger(page).click();
    await shot(page, testInfo, 'qa130-vi-1440-dark-menu');
    await page.keyboard.press('Escape');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 780 });
    await expect(trigger(page)).toBeVisible();
    await trigger(page).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await shot(page, testInfo, 'qa130-vi-360-menu');
    await page.getByRole('menuitem', { name: vi.jobs.status.actions.close }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await shot(page, testInfo, 'qa130-vi-360-close-dialog');
  });
});

test.describe('job status in English (QA #130)', () => {
  test.use({ locale: 'en-US', viewport: { width: 1440, height: 900 } });

  test('every item, the confirmation and the badge are in English', async ({ page }, testInfo) => {
    const { jobId } = await adminWithJob(page, testInfo, 'en');
    const { actions } = en.jobs.status;
    await page.goto(`/jobs/${jobId}`);
    await expect(badge(page)).toHaveText(en.jobs.status.draft);

    await trigger(page, en).click();
    await expect(menuItems(page)).toHaveText([actions.open]);
    await page.getByRole('menuitem', { name: actions.open }).click();
    await expect(badge(page)).toHaveText(en.jobs.status.open);

    await trigger(page, en).click();
    await expect(menuItems(page)).toHaveText([actions.pause, actions.close]);
    await shot(page, testInfo, 'qa130-en-1440-menu');
    await page.getByRole('menuitem', { name: actions.pause }).click();
    await expect(badge(page)).toHaveText(en.jobs.status.paused);

    await trigger(page, en).click();
    await expect(menuItems(page)).toHaveText([actions.resume, actions.close]);
    await page.getByRole('menuitem', { name: actions.close }).click();
    const dialog = page.getByRole('dialog', { name: actions.closeConfirm.title });
    await expect(dialog).toContainText(actions.closeConfirm.body);
    await expect(dialog.getByRole('button', { name: en.common.cancel })).toBeVisible();
    await shot(page, testInfo, 'qa130-en-1440-close-dialog');
    await dialog.getByRole('button', { name: actions.closeConfirm.confirm }).click();
    await expect(badge(page)).toHaveText(en.jobs.status.closed);

    await trigger(page, en).click();
    await expect(menuItems(page)).toHaveText([actions.reopen]);
    await page.getByRole('menuitem', { name: actions.reopen }).click();
    await expect(badge(page)).toHaveText(en.jobs.status.open);
  });
});
