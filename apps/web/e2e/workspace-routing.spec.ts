// Issue #107: after sign-in the app sends users to `/welcome` (WS-06) without a workspace, to their
// only workspace, or to the chooser (WS-04) when they have several and none is active. Runs against
// the real API and the Compose Postgres with fresh synthetic users. Workspaces are created through
// `POST /api/workspaces` from the page; signing in again starts a session with no active workspace.
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, signInAsNewUser, uniqueEmail } from './support/session';

const password = 'qa-Password-e2e!';

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

async function listWorkspaces(page: Page): Promise<WorkspaceList> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status(), 'GET /api/workspaces').toBe(200);
  return (await response.json()) as WorkspaceList;
}

/** Drops the session and signs in through the sign-in form, opened at `path`. */
async function signInAgain(page: Page, email: string, path = '/sign-in'): Promise<void> {
  await page.context().clearCookies();
  await page.goto(path);
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

test.describe('workspace routing', () => {
  test.use({ locale: 'vi-VN' });

  test('a newly verified user lands on /welcome and "Tạo không gian" opens the form', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-new');
    await signInAsNewUser(page, email);

    await signInAgain(page, email);

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.welcome.title);
    await expect(page.getByTestId('auth-subtitle')).toHaveText(vi.workspaces.welcome.subtitle);
    await page.getByRole('button', { name: vi.workspaces.welcome.create }).click();
    await expect(page).toHaveURL(/\/workspaces\/new$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.create.title);
  });

  test('creating the first workspace from /welcome lands on / with it active', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-first');
    await signInAsNewUser(page, email);
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);

    await page.getByTestId('welcome-create').click();
    await page.getByTestId('create-workspace-name').fill('An Nhiên');
    await page.getByTestId('create-workspace-submit').click();

    // `/` opens /jobs inside the app layout (#113).
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
  });

  test('a user with one workspace and none active lands on / with it active', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-one');
    await signInAsNewUser(page, email);
    const id = await createWorkspace(page, 'An Nhiên');

    await signInAgain(page, email);

    // `/` opens /jobs inside the app layout (#113).
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(id);
  });

  test('a user with two workspaces and none active chooses one and returns to the deep link', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-two');
    await signInAsNewUser(page, email);
    const mayId = await createWorkspace(page, 'Mây Studio');
    await createWorkspace(page, 'An Nhiên');

    await page.context().clearCookies();
    await page.goto('/jobs?status=open');
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs%3Fstatus%3Dopen$/);
    await signInAgain(page, email, page.url());

    await expect(page).toHaveURL(/\/workspaces\?redirect=%2Fjobs%3Fstatus%3Dopen$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.choose.title);
    await page.getByTestId('workspace-row').filter({ hasText: 'Mây Studio' }).click();

    await expect(page).toHaveURL(/\/jobs\?status=open$/);
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(mayId);
  });

  test('a user with a workspace opening /welcome is sent to /', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-welcome');
    await signInAsNewUser(page, email);
    await createWorkspace(page, 'An Nhiên');

    await page.goto('/welcome');

    // `/` opens /jobs inside the app layout (#113).
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
  });
});
