// Issue #106: the workspace chooser at `/workspaces` (design WS-04) against the real API and the
// Compose Postgres. A fresh synthetic user is signed in through `support/session.ts` and two
// workspaces are created for them through `POST /api/workspaces` from the page, so the session
// cookie and the browser origin are the app's own.
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { signInAsNewUser, uniqueEmail } from './support/session';

const copy = vi.workspaces.choose;

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string; codePrefix: string; role: string }>;
}

/** Creates a workspace as the signed-in user; the API makes it the session's active one. */
async function createWorkspace(page: Page, name: string): Promise<string> {
  const result = await page.evaluate(async (workspaceName) => {
    const response = await fetch('/api/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': globalThis.crypto.randomUUID(),
      },
      body: JSON.stringify({ name: workspaceName }),
    });
    return { status: response.status, body: (await response.json()) as { id: string } };
  }, name);
  expect(result.status, `POST /api/workspaces ${name}`).toBe(201);
  return result.body.id;
}

async function listWorkspaces(page: Page): Promise<WorkspaceList> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status(), 'GET /api/workspaces').toBe(200);
  return (await response.json()) as WorkspaceList;
}

test.describe('choose workspace', () => {
  test.use({ locale: 'vi-VN' });

  test('a member of two workspaces picks the second, lands on / and it is active', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa106');
    await signInAsNewUser(page, email);

    // Created in this order, "An Nhiên" is active and listed first; "Mây Studio" is the second row.
    const mayId = await createWorkspace(page, 'Mây Studio');
    const anNhienId = await createWorkspace(page, 'An Nhiên');
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(anNhienId);

    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
    const rows = page.getByTestId('workspace-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('An Nhiên');
    await expect(rows.nth(1)).toContainText('Mây Studio');

    const switched = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/workspaces/active') && response.request().method() === 'PUT',
    );
    await rows.nth(1).click();
    expect((await switched).status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home-page')).toBeVisible();

    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(mayId);
  });

  for (const key of ['Enter', 'Space']) {
    test(`a row activates with ${key}, switching once`, async ({ page }, testInfo) => {
      const email = uniqueEmail(testInfo, `qa106${key.toLowerCase()}`);
      await signInAsNewUser(page, email);
      const mayId = await createWorkspace(page, 'Mây Studio');
      await createWorkspace(page, 'An Nhiên');
      let switches = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('/api/workspaces/active') && request.method() === 'PUT') {
          switches++;
        }
      });

      await page.goto('/workspaces');
      await expect(page.getByTestId('workspace-row')).toHaveCount(2);
      await page.getByTestId('workspace-row').nth(1).focus();
      await page.keyboard.press(key);

      await expect(page).toHaveURL(/\/$/);
      expect(switches).toBe(1);
      expect((await listWorkspaces(page)).activeWorkspaceId).toBe(mayId);
    });
  }

  test('"Tạo không gian mới" opens the new-workspace form and "Đăng xuất" signs out', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa106s'));
    await createWorkspace(page, 'An Nhiên');

    await page.goto('/workspaces');
    await page.getByTestId('choose-workspace-create').click();
    await expect(page).toHaveURL(/\/workspaces\/new\?from=chooser$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.create.newTitle);

    await page.goto('/workspaces');
    await page.getByTestId('choose-workspace-sign-out').click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await page.request.get('/api/workspaces')).status()).toBe(401);
  });
});
