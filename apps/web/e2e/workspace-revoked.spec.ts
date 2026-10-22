// Issue #108: when the API says access to the active workspace was revoked (403
// `WORKSPACE_ACCESS_REVOKED`, decisions §3), the app drops that workspace's data and goes to the
// chooser with `?revoked=1`, or to `/welcome` when no workspace is left. Runs against the real API and
// the Compose Postgres with fresh synthetic users; the membership is deactivated with psql, and the
// chooser's list after the redirect is the real `GET /api/workspaces`.
//
// The API has no workspace-scoped route yet (every route so far is `@SessionOnly()`, the first ones
// come with jobs), so nothing on the stack can answer the guard's 403 today. The one triggering
// call, `GET /api/jobs`, is answered here with exactly what the global access guard (#102) sends for
// a deactivated membership, after checking against the real API that the membership really is gone.
// Once a workspace-scoped route exists, drop the `page.route` and call it instead.
import { WORKSPACE_ACCESS_REVOKED } from '@ats/shared';
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

/** A workspace-scoped path the app will call; see the note above. */
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

/** Deactivates `email`'s membership in `workspaceId` in the Compose Postgres. */
function deactivateMembership(email: string, workspaceId: string): void {
  psql(
    `update member set status = 'deactivated' where organization_id = ${sqlString(workspaceId)} and user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
}

/** Answers `GET /api${SCOPED_PATH}` the way the access guard does for a revoked membership. */
async function answerAsRevoked(page: Page): Promise<void> {
  await page.route(`**/api${SCOPED_PATH}`, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: WORKSPACE_ACCESS_REVOKED, message: 'Workspace access revoked' }),
    }),
  );
}

/** Makes `count` parallel calls to the workspace-scoped path through the app's own API client. */
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

test.describe('revoked workspace access', () => {
  test.use({ locale: 'vi-VN' });

  test('losing workspace A with B left lands on /workspaces?revoked=1 with the notice, without A', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa108-two');
    await signInAsNewUser(page, email);
    const aId = await createWorkspace(page, 'Mây Studio');
    await createWorkspace(page, 'An Nhiên');
    const switched = await page.request.put('/api/workspaces/active', {
      data: { workspaceId: aId },
    });
    expect(switched.status(), 'PUT /api/workspaces/active').toBe(200);

    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();

    deactivateMembership(email, aId);
    // The real API no longer lets the session use A.
    const after = await listWorkspaces(page);
    expect(after.activeWorkspaceId).toBeNull();
    expect(after.workspaces.map((w) => w.name)).toEqual(['An Nhiên']);

    await answerAsRevoked(page);
    // Three parallel refusals still navigate once.
    await callScopedApi(page, 3);

    await expect(page).toHaveURL(/\/workspaces\?revoked=1$/);
    await expect(page.getByTestId('choose-workspace-revoked')).toHaveText(
      vi.workspaces.revoked.notice,
    );
    const rows = page.getByTestId('workspace-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveText(/An Nhiên/);
    await expect(rows.filter({ hasText: 'Mây Studio' })).toHaveCount(0);
  });

  test('losing the last workspace lands on /welcome', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa108-last');
    await signInAsNewUser(page, email);
    const aId = await createWorkspace(page, 'Mây Studio');

    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();

    deactivateMembership(email, aId);
    const after = await listWorkspaces(page);
    expect(after).toEqual({ activeWorkspaceId: null, workspaces: [] });

    await answerAsRevoked(page);
    await callScopedApi(page);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.welcome.title);
  });
});
