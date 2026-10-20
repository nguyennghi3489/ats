// QA for issue #105, against the real API and the Compose Postgres: the create-workspace edges the
// issue spec (create-workspace.spec.ts) does not walk through in a browser. A lost answer (503) is
// mocked in the browser only for the first POST; the retry reaches the real API, so the
// Idempotency-Key reuse is checked end to end (one workspace, not two). English screenshots are
// written to test-results/ for comparison with the design (no baselines).
import { expect, type Page, type Request, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { signInAsNewUser, uniqueEmail } from './support/session';

const vic = vi.workspaces.create;
const enc = en.workspaces.create;

const nameField = (page: Page) => page.getByTestId('create-workspace-name');
const submit = (page: Page) => page.getByTestId('create-workspace-submit');
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

const isCreate = (request: Request) =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/api/workspaces';

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string }>;
}

/**
 * The user's workspaces and the active one. `GET /api/workspaces` is not served yet (#101), so this
 * reads Better Auth's organization list and the session's active organization instead.
 */
async function listWorkspaces(page: Page): Promise<WorkspaceList> {
  const orgs = await page.request.get('/api/auth/organization/list');
  expect(orgs.status()).toBe(200);
  const session = await page.request.get('/api/auth/get-session');
  expect(session.status()).toBe(200);
  const body = (await session.json()) as { session?: { activeOrganizationId?: string | null } };
  return {
    activeWorkspaceId: body.session?.activeOrganizationId ?? null,
    workspaces: (await orgs.json()) as WorkspaceList['workspaces'],
  };
}

/** Records every create request the page sends. */
function recordCreates(page: Page): Request[] {
  const sent: Request[] = [];
  page.on('request', (request) => {
    if (isCreate(request)) sent.push(request);
  });
  return sent;
}

async function fillName(page: Page, value: string) {
  await nameField(page).fill(value);
}

test.describe('create workspace (QA #105)', () => {
  test.use({ locale: 'vi-VN' });

  test('signed out, /workspaces/new goes to sign-in', async ({ page }) => {
    await page.goto('/workspaces/new');
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fworkspaces%2Fnew$/);
  });

  test('an empty or blank name shows the field error and sends nothing', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-empty'));
    await page.goto('/workspaces/new');
    await expect(heading(page)).toHaveText(vic.title);
    const sent = recordCreates(page);

    await submit(page).click();
    await expect(page.getByText(vic.errors.NAME_REQUIRED)).toBeVisible();
    await fillName(page, '   ');
    await submit(page).click();
    await expect(page.getByText(vic.errors.NAME_REQUIRED)).toBeVisible();
    await expect(page).toHaveURL(/\/workspaces\/new$/);
    await page.waitForTimeout(300);
    expect(sent).toHaveLength(0);
    expect((await listWorkspaces(page)).workspaces).toEqual([]);
  });

  test('"Thử lại" after a lost answer reuses the key and creates exactly one workspace', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-retry'));
    await page.goto('/workspaces/new');
    const sent = recordCreates(page);

    // The first POST reaches the API (the workspace is created) but its answer is replaced by a
    // 503, as a dropped response would look. The retry goes through untouched.
    let first = true;
    await page.route('**/api/workspaces', async (route) => {
      if (!isCreate(route.request()) || !first) return route.fallback();
      first = false;
      const real = await route.fetch();
      expect(real.status()).toBe(201);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR' }),
      });
    });

    await fillName(page, 'An Nhiên');
    await submit(page).click();
    await expect(heading(page)).toHaveText(vic.failedTitle);
    await expect(submit(page)).toHaveText(vic.retry);

    await submit(page).click();
    await expect(page).toHaveURL(/\/$/);

    expect(sent).toHaveLength(2);
    const keys = await Promise.all(sent.map((r) => r.headerValue('Idempotency-Key')));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);

    const list = await listWorkspaces(page);
    expect(list.workspaces).toHaveLength(1);
    expect(list.workspaces[0]).toMatchObject({ name: 'An Nhiên' });
    expect(list.activeWorkspaceId).toBe(list.workspaces[0]?.id);
  });

  test('"Quay lại" keeps the name; a changed name gets a new key', async ({ page }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-newkey'));
    await page.goto('/workspaces/new');
    const sent = recordCreates(page);
    let failures = 1;
    await page.route('**/api/workspaces', (route) => {
      if (!isCreate(route.request()) || failures-- <= 0) return route.fallback();
      return route.abort('connectionreset');
    });

    await fillName(page, 'An Nhiên');
    await submit(page).click();
    await expect(heading(page)).toHaveText(vic.failedTitle);
    await page.getByTestId('create-workspace-back').click();
    await expect(heading(page)).toHaveText(vic.title);
    await expect(nameField(page)).toHaveValue('An Nhiên');

    await fillName(page, 'Bình Minh');
    await submit(page).click();
    await expect(page).toHaveURL(/\/$/);

    expect(sent).toHaveLength(2);
    const keys = await Promise.all(sent.map((r) => r.headerValue('Idempotency-Key')));
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
    const list = await listWorkspaces(page);
    expect(list.workspaces.map((w) => w.name)).toEqual(['Bình Minh']);
  });

  test('"Đăng xuất" ends the session and goes to /sign-in', async ({ page }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-signout'));
    await page.goto('/workspaces/new');
    await page.getByTestId('create-workspace-sign-out').click();
    await expect(page).toHaveURL(/\/sign-in$/);
    const session = await page.request.get('/api/auth/get-session');
    expect(await session.text()).toMatch(/^(null)?$/);
    await page.goto('/workspaces/new');
    await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  });

  test('with a workspace already (no ?from), WS-05 shows and "Hủy · Quay lại danh sách" goes to /workspaces', async ({
    page,
  }, testInfo) => {
    // Known failure: the view detects "already has workspaces" through GET /api/workspaces, which
    // the API does not serve yet (#101, 404), so it falls back to WS-01. Remove once #101 lands.
    test.fail(true, 'GET /api/workspaces is not served yet (#101)');
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-ws05'));
    const created = await page.request.post('/api/workspaces', {
      data: { name: 'Công ty Có Sẵn' },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    expect(created.status()).toBe(201);

    await page.goto('/workspaces/new');
    await expect(heading(page)).toHaveText(vic.newTitle);
    await expect(page.getByTestId('create-workspace-back-to-list')).toHaveText(vic.backToList);
    await expect(page.getByTestId('create-workspace-invite-notice')).toHaveCount(0);
    await expect(page.getByTestId('create-workspace-sign-out')).toHaveCount(0);
    await page.getByTestId('create-workspace-back-to-list').click();
    await expect(page).toHaveURL(/\/workspaces$/);
  });

  test('?from=chooser: "Hủy · Quay lại danh sách" goes to /workspaces', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-chooser'));
    await page.goto('/workspaces/new?from=chooser');
    await expect(heading(page)).toHaveText(vic.newTitle);
    await page.getByTestId('create-workspace-back-to-list').click();
    await expect(page).toHaveURL(/\/workspaces$/);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US', viewport: { width: 1440, height: 900 } });

    test('every state shows the English copy (screenshots in test-results)', async ({
      page,
    }, testInfo) => {
      await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-en'), 'en');
      await page.goto('/workspaces/new');
      await expect(heading(page)).toHaveText(enc.title);
      await expect(page.getByTestId('auth-subtitle')).toHaveText(enc.subtitle);
      await expect(page.getByTestId('create-workspace-invite-notice')).toHaveText(enc.inviteOnly);
      await expect(page.getByTestId('create-workspace-sign-out')).toHaveText(enc.signOut);
      await expect(submit(page)).toHaveText(enc.submit);
      await submit(page).click();
      await expect(page.getByText(enc.errors.NAME_REQUIRED)).toBeVisible();
      await fillName(page, 'An Nhien');
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.screenshot({ path: testInfo.outputPath('en-ws-01.png'), fullPage: true });

      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/workspaces', async (route) => {
        if (!isCreate(route.request())) return route.fallback();
        await held;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL_ERROR' }),
        });
      });
      await submit(page).click();
      await expect(heading(page)).toHaveText(enc.pendingTitle);
      await expect(submit(page)).toHaveText(enc.pendingButton);
      await expect(page.getByTestId('create-workspace-pending-notice')).toHaveText(
        enc.pendingNotice,
      );
      await page.mouse.move(0, 0);
      await page.screenshot({ path: testInfo.outputPath('en-ws-02.png'), fullPage: true });

      release();
      await expect(heading(page)).toHaveText(enc.failedTitle);
      await expect(page.getByTestId('create-workspace-failed')).toHaveText(enc.failedNotice);
      await expect(submit(page)).toHaveText(enc.retry);
      await expect(page.getByTestId('create-workspace-back')).toHaveText(enc.back);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: testInfo.outputPath('en-ws-03.png'), fullPage: true });

      await page.goto('/workspaces/new?from=chooser');
      await expect(heading(page)).toHaveText(enc.newTitle);
      await expect(page.getByTestId('create-workspace-back-to-list')).toHaveText(enc.backToList);
      await page.screenshot({ path: testInfo.outputPath('en-ws-05.png'), fullPage: true });

      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/workspaces/new');
      await expect(heading(page)).toHaveText(enc.title);
      await expect(page.getByTestId('create-workspace-invite-short')).toHaveText(
        enc.inviteOnlyShort,
      );
      await page.screenshot({ path: testInfo.outputPath('en-ws-07.png'), fullPage: true });
    });
  });

  test('vi WS-01 with the pointer away and the field blurred (screenshot in test-results)', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa105-vi-shot'));
    await page.goto('/workspaces/new');
    await fillName(page, 'An Nhiên');
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.screenshot({ path: testInfo.outputPath('vi-ws-01.png'), fullPage: true });
  });
});
