// QA for issue #106, against the real API and the Compose Postgres: the chooser edges the issue spec
// (choose-workspace.spec.ts) does not walk through in a browser. A revoked membership gives a real
// WORKSPACE_UNAVAILABLE, the English copy is checked against the vi layout, and the guard and the
// `redirect` query are followed end to end. Screenshots are written to test-results/ for review.
//
// Run with COMPOSE_PROJECT_NAME set to the Compose project whose Postgres the API uses.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

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

test.describe('choose workspace (QA #106)', () => {
  test.use({ locale: 'vi-VN' });

  test('a revoked workspace answers WORKSPACE_UNAVAILABLE: the list reloads and the vi notice shows', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa106rev');
    await signInAsNewUser(page, email);
    const mayId = await createWorkspace(page, 'Mây Studio');
    const anNhienId = await createWorkspace(page, 'An Nhiên');

    await page.goto('/workspaces');
    const rows = page.getByTestId('workspace-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Mây Studio');

    // Access to "Mây Studio" is revoked after the list was shown.
    psql(
      `update member set status = 'deactivated' where organization_id = ${sqlString(mayId)} ` +
        `and user_id = (select id from "user" where email = ${sqlString(email)})`,
    );

    const switched = page.waitForResponse(
      (r) => r.url().endsWith('/api/workspaces/active') && r.request().method() === 'PUT',
    );
    const reloaded = page.waitForResponse(
      (r) => r.url().endsWith('/api/workspaces') && r.request().method() === 'GET',
    );
    await rows.nth(1).click();
    const switchResponse = await switched;
    expect(switchResponse.status()).toBe(404);
    expect(((await switchResponse.json()) as { code: string }).code).toBe('WORKSPACE_UNAVAILABLE');
    await reloaded;

    await expect(page.getByTestId('choose-workspace-error')).toContainText(
      vi.workspaces.choose.unavailable,
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('An Nhiên');
    await expect(rows.nth(0)).toBeEnabled();
    await expect(page).toHaveURL(/\/workspaces$/);
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(anNhienId);
    await page.screenshot({
      path: testInfo.outputPath('ws-04-unavailable-vi.png'),
      fullPage: true,
    });
  });

  test('Tab reaches every row in order, then "Tạo không gian mới" and "Đăng xuất"', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa106tab'));
    await createWorkspace(page, 'Mây Studio');
    await createWorkspace(page, 'An Nhiên');
    await page.goto('/workspaces');
    await expect(page.getByTestId('workspace-row')).toHaveCount(2);

    const rows = page.getByTestId('workspace-row');
    await rows.nth(0).focus();
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('choose-workspace-create')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('choose-workspace-sign-out')).toBeFocused();
  });

  test('a safe redirect is followed after switching; an off-site one lands on /jobs', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa106redir'));
    const mayId = await createWorkspace(page, 'Mây Studio');
    const anNhienId = await createWorkspace(page, 'An Nhiên');

    await page.goto('/workspaces?redirect=%2Fjobs%3Fstatus%3Dopen');
    await page.getByTestId('workspace-row').nth(1).click();
    await expect(page).toHaveURL(/\/jobs\?status=open$/);
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(mayId);

    await page.goto('/workspaces?redirect=%2F%2Fevil.example');
    await page.getByTestId('workspace-row').nth(0).click();
    // The fallback `/` opens `/jobs` (#113).
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/jobs$/);
    expect((await listWorkspaces(page)).activeWorkspaceId).toBe(anNhienId);
  });

  test('signed out, /workspaces goes to sign-in', async ({ page }) => {
    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  });
});

test.describe('choose workspace in English (QA #106)', () => {
  test.use({ locale: 'en-US' });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 360, height: 800 },
  ]) {
    test(`WS-04 shows the English copy at ${viewport.width} px without overflow`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await signInAsNewUser(page, uniqueEmail(testInfo, `qa106en${viewport.width}`), 'en');
      for (const name of ['An Nhiên', 'Mây Studio', 'Hải Đăng Labs']) {
        await createWorkspace(page, name);
      }
      await page.goto('/workspaces');
      // The English sign-up stores locale en; the switcher is used as well so the copy is English
      // regardless of how the shell picks the first locale.
      const enToggle = page.getByRole('button', { name: /^EN$/ });
      if (await enToggle.isVisible()) await enToggle.click();

      const copy = en.workspaces.choose;
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
      await expect(page.getByText(copy.subtitle)).toBeVisible();
      await expect(page.getByTestId('workspace-row')).toHaveCount(3);
      await expect(page.getByTestId('choose-workspace-create')).toHaveText(copy.create);
      await expect(page.getByTestId('choose-workspace-sign-out')).toHaveText(copy.signOut);
      await expect(page.getByRole('list', { name: copy.listLabel })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.screenshot({
        path: testInfo.outputPath(`ws-04-${viewport.width}-en.png`),
        fullPage: true,
      });
    });
  }
});
