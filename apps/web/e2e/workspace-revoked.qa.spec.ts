// QA #108: revoked workspace access, beyond the developer spec (workspace-revoked.spec.ts).
//
// - vi first, then en: the chooser's notice copy after a revocation, placed above the list of the
//   WS-04 chooser (docs/design/03-authentication-onboarding/ats-auth-screen-ws-04-...png); the
//   revoked state itself has no design screen (issue #108, "Design screens: None").
// - three parallel refusals push one history entry, not three.
// - nothing of workspace A survives: the chooser's list and the store come from a fresh
//   `GET /api/workspaces`, and picking B goes on in B with the notice gone.
// - an ordinary 403 (a role refusal) on the same stack leaves the user where they are.
//
// As in the developer spec, the API has no workspace-scoped route yet (every route is
// `@SessionOnly()`), so the one triggering call is answered with the body the global access guard
// (#102) sends, after the real API has confirmed the membership is gone.
import { WORKSPACE_ACCESS_REVOKED } from '@ats/shared';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const SCOPED_PATH = '/jobs';

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

async function listWorkspaces(page: Page): Promise<WorkspaceList> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status(), 'GET /api/workspaces').toBe(200);
  return (await response.json()) as WorkspaceList;
}

function deactivateMembership(email: string, workspaceId: string): void {
  psql(
    `update member set status = 'deactivated' where organization_id = ${sqlString(workspaceId)} and user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
}

async function answerWith(page: Page, status: number, code: string): Promise<void> {
  await page.route(`**/api${SCOPED_PATH}`, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ code, message: 'No access to a workspace' }),
    }),
  );
}

async function callScopedApi(page: Page, count = 1): Promise<void> {
  await page.evaluate(
    async ([apiPath, path, n]) => {
      const { api } = (await import(/* @vite-ignore */ apiPath)) as {
        api: { get: (p: string) => Promise<unknown> };
      };
      await Promise.all(Array.from({ length: n }, () => api.get(path).catch(() => undefined)));
    },
    ['/src/lib/api.ts', SCOPED_PATH, count] as const,
  );
}

function shotPath(testInfo: TestInfo, name: string): string {
  const dir = process.env.QA_SHOT_DIR;
  return dir ? `${dir}/${name}` : testInfo.outputPath(name);
}

/** Signed in with workspaces A ("Mây Studio") and B ("An Nhiên"), A active, on /jobs. */
async function onJobsOfA(page: Page, email: string, locale: 'vi' | 'en'): Promise<string> {
  await signInAsNewUser(page, email, locale);
  const aId = await createWorkspace(page, 'Mây Studio');
  await createWorkspace(page, 'An Nhiên');
  const switched = await page.request.put('/api/workspaces/active', { data: { workspaceId: aId } });
  expect(switched.status(), 'PUT /api/workspaces/active').toBe(200);
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId('app-layout')).toBeVisible();
  return aId;
}

for (const [lang, messages, browserLocale] of [
  ['vi', vi, 'vi-VN'],
  ['en', en, 'en-US'],
] as const) {
  test.describe(`revoked workspace access (QA #108, ${lang})`, () => {
    test.use({ locale: browserLocale });

    test(`${lang}: the chooser explains the revocation above the WS-04 list, then B can be picked`, async ({
      page,
    }, testInfo) => {
      const email = uniqueEmail(testInfo, `qa108-${lang}`);
      const aId = await onJobsOfA(page, email, lang);

      deactivateMembership(email, aId);
      await answerWith(page, 403, WORKSPACE_ACCESS_REVOKED);
      const historyBefore = await page.evaluate(() => history.length);
      await callScopedApi(page, 3);

      await expect(page).toHaveURL(/\/workspaces\?revoked=1$/);
      // Three parallel refusals, one navigation.
      expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        messages.workspaces.choose.title,
      );
      const notice = page.getByTestId('choose-workspace-revoked');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText(messages.workspaces.revoked.notice);
      await expect(notice).toHaveAttribute('role', 'status');
      await expect(page.getByTestId('choose-workspace-error')).toHaveCount(0);

      // Notice sits inside the chooser, above the list (WS-04 order: title, list, create).
      const rows = page.getByTestId('workspace-row');
      await expect(rows).toHaveCount(1);
      await expect(rows).toHaveText(/An Nhiên/);
      const noticeBox = (await notice.boundingBox())!;
      const listBox = (await page.getByTestId('choose-workspace-list').boundingBox())!;
      expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(listBox.y);
      expect(Math.abs(noticeBox.width - listBox.width)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('choose-workspace-create')).toHaveText(
        messages.workspaces.choose.create,
      );
      await expect(page.getByTestId('app-sidebar')).toHaveCount(0);
      for (const width of [1440, 360]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal scrolling at ${width} px`).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: shotPath(testInfo, `qa108-chooser-revoked-${lang}-${width}.png`),
          fullPage: true,
        });
      }

      // Picking the remaining workspace goes on in B; the notice does not follow.
      await page.unroute(`**/api${SCOPED_PATH}`);
      await rows.first().click();
      await expect(page).not.toHaveURL(/\/workspaces/);
      await expect(page.getByTestId('app-layout')).toBeVisible();
      await expect(page.getByTestId('choose-workspace-revoked')).toHaveCount(0);
      const after = await listWorkspaces(page);
      expect(after.workspaces.map((w) => w.name)).toEqual(['An Nhiên']);
      expect(after.activeWorkspaceId).toBe(after.workspaces[0]!.id);
    });
  });
}

test.describe('revoked workspace access, other cases (QA #108)', () => {
  test.use({ locale: 'vi-VN' });

  test('the store holds only the fresh list after the redirect, without A', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa108-store');
    const aId = await onJobsOfA(page, email, 'vi');

    deactivateMembership(email, aId);
    await answerWith(page, 403, WORKSPACE_ACCESS_REVOKED);
    await callScopedApi(page);
    await expect(page).toHaveURL(/\/workspaces\?revoked=1$/);

    // Reloading the chooser keeps the notice (it is the URL's) and still never lists A.
    await page.reload();
    await expect(page.getByTestId('choose-workspace-revoked')).toHaveText(
      vi.workspaces.revoked.notice,
    );
    await expect(page.getByTestId('workspace-row')).toHaveCount(1);
    await expect(page.getByTestId('workspace-row').filter({ hasText: 'Mây Studio' })).toHaveCount(
      0,
    );
    // Opening a workspace page again does not bring A back: with B the only workspace left, the
    // workspace guard (#107) makes B active, never A.
    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    const after = await listWorkspaces(page);
    expect(after.activeWorkspaceId).not.toBe(aId);
    expect(after.workspaces.find((w) => w.id === after.activeWorkspaceId)?.name).toBe('An Nhiên');
  });

  test('an ordinary 403 (ROLE_NOT_ALLOWED) leaves the user on /jobs in workspace A', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa108-role');
    const aId = await onJobsOfA(page, email, 'vi');

    await answerWith(page, 403, 'ROLE_NOT_ALLOWED');
    await callScopedApi(page, 3);
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(aId);
  });

  test('a signed-in user with no workspace left lands on /welcome in en too', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    const email = uniqueEmail(testInfo, 'qa108-last-en');
    await signInAsNewUser(page, email, 'en');
    const aId = await createWorkspace(page, 'Mây Studio');
    await page.goto('/jobs');
    await expect(page.getByTestId('app-layout')).toBeVisible();

    deactivateMembership(email, aId);
    await answerWith(page, 403, WORKSPACE_ACCESS_REVOKED);
    await callScopedApi(page, 3);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.workspaces.welcome.title);
    await page.screenshot({ path: shotPath(testInfo, 'qa108-welcome-en.png'), fullPage: true });
    await context.close();
  });
});
