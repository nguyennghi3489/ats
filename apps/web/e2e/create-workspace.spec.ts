// Issue #105: the create-workspace screen at `/workspaces/new` (design WS-01, WS-02, WS-03, WS-05 and
// WS-07) against the real API, the Compose Postgres, Redis and Mailpit. The verification email is
// delivered by the worker that `playwright.config.ts` starts next to the API. Addresses are synthetic
// and unique per test.
//
// The flow test signs up through the screen, follows the real verification link from Mailpit, signs
// in and creates "An Nhiên". The screenshot tests sign a fresh user in through `support/session.ts`
// (no workspace, so WS-01); WS-02 holds the `POST /api/workspaces` unanswered and WS-03 answers it
// with a 503, both in the browser, so no workspace is created for them.
//
// The light / dark baselines live in create-workspace.spec.ts-snapshots/, one per platform: `-linux`
// is what CI compares against (rendered by the Chromium of the mcr.microsoft.com/playwright image of
// the installed version), and `-darwin` serves local runs on macOS. Refresh both with
// `--update-snapshots` after a visual change.
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo, type MailpitMessage } from './support/mailpit';
import { signInAsNewUser, uniqueEmail } from './support/session';

const password = 'qa-Password-105!';
const workspaceName = 'An Nhiên';
const copy = vi.workspaces.create;

const nameField = (page: Page) => page.getByTestId('create-workspace-name');
const submit = (page: Page) => page.getByTestId('create-workspace-submit');

/** The verification link of an email, as the user would click it. */
function verificationLink(message: MailpitMessage): string {
  const link = /https?:\/\/\S*\/verify-email\?token=[^\s"'<>)]+/.exec(message.text)?.[0];
  if (!link) throw new Error(`No verification link in "${message.subject}"`);
  return link;
}

interface WorkspaceList {
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string; codePrefix: string; role: string }>;
}

/**
 * `GET /api/workspaces` with the page's session cookie. This issue's
 * criterion checks the new workspace there, so a missing route fails the test.
 */
async function listWorkspaces(page: Page): Promise<WorkspaceList> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status(), 'GET /api/workspaces').toBe(200);
  return (await response.json()) as WorkspaceList;
}

/** The session's active workspace, as Better Auth reports it. */
async function sessionActiveWorkspaceId(page: Page): Promise<string | null | undefined> {
  const response = await page.request.get('/api/auth/get-session');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { session?: { activeOrganizationId?: string | null } };
  return body.session?.activeOrganizationId;
}

test.describe('create workspace', () => {
  // A Vietnamese browser, so the page opens in Vietnamese.
  test.use({ locale: 'vi-VN' });

  test('a newly verified user creates "An Nhiên", lands on / and it is the active workspace', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const email = uniqueEmail(testInfo, 'qa105');

    await test.step('sign up and follow the verification link from Mailpit', async () => {
      await page.goto('/sign-up');
      await page.getByTestId('sign-up-name').fill('QA Workspace');
      await page.getByTestId('sign-up-email').fill(email);
      await page.getByTestId('sign-up-password').fill(password);
      await page.getByTestId('sign-up-submit').click();
      await expect(page).toHaveURL(/\/verify-email\?email=/);

      await page.goto(verificationLink(await latestMessageTo(email, { timeoutMs: 20_000 })));
      await expect(page).toHaveURL(/\/verify-email\/success$/);
    });

    await test.step('sign in and open /workspaces/new (WS-01)', async () => {
      await page.goto('/sign-in?redirect=/workspaces/new');
      await page.getByTestId('sign-in-email').fill(email);
      await page.getByTestId('sign-in-password').fill(password);
      await page.getByTestId('sign-in-submit').click();
      await expect(page).toHaveURL(/\/workspaces\/new$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
      await expect(page.getByTestId('create-workspace-invite-notice')).toHaveText(copy.inviteOnly);
      expect((await listWorkspaces(page)).workspaces).toEqual([]);
    });

    let createdId = '';
    await test.step('create "An Nhiên" and land on /', async () => {
      await nameField(page).fill(workspaceName);
      const created = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/workspaces') && response.request().method() === 'POST',
      );
      await submit(page).click();
      const response = await created;
      expect(response.status()).toBe(201);
      const workspace = (await response.json()) as { id: string; name: string };
      expect(workspace).toMatchObject({ name: workspaceName, codePrefix: 'AN', role: 'admin' });
      createdId = workspace.id;
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('home-page')).toBeVisible();
    });

    await test.step('it is the active workspace', async () => {
      expect(await sessionActiveWorkspaceId(page)).toBe(createdId);
      const list = await listWorkspaces(page);
      expect(list.workspaces).toEqual([
        expect.objectContaining({ id: createdId, name: workspaceName, role: 'admin' }),
      ]);
      expect(list.activeWorkspaceId).toBe(createdId);
    });
  });

  /** Opens the form signed in as a fresh user, with the name typed as in the design. */
  async function openForm(page: Page, email: string, path = '/workspaces/new'): Promise<void> {
    await signInAsNewUser(page, email);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await nameField(page).fill(workspaceName);
  }

  async function expectScreenshot(page: Page, name: string): Promise<void> {
    // The designs show no focused control.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme });
      });

      test.describe('1440 px', () => {
        test.use({ viewport: { width: 1440, height: 900 } });

        test(`WS-01 first workspace matches the design (${colorScheme})`, async ({
          page,
        }, testInfo) => {
          await openForm(page, uniqueEmail(testInfo, `qa105-ws01-${colorScheme}`));
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
          await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.subtitle);
          await expect(page.getByTestId('create-workspace-invite-notice')).toBeVisible();
          await expect(page.getByTestId('create-workspace-invite-short')).toBeHidden();
          await expect(page.getByTestId('create-workspace-sign-out')).toHaveText(copy.signOut);
          expect((await page.locator('.auth-layout__card').boundingBox())?.width).toBe(448);
          await expectScreenshot(page, `ws-01-1440-${colorScheme}`);
        });

        test(`WS-02 creating matches the design (${colorScheme})`, async ({ page }, testInfo) => {
          await openForm(page, uniqueEmail(testInfo, `qa105-ws02-${colorScheme}`));
          // Hold the request unanswered, so the page stays in WS-02.
          await page.route('**/api/workspaces', async (route) => {
            if (route.request().method() !== 'POST') return route.fallback();
            await new Promise<void>(() => {});
          });
          await submit(page).click();

          await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.pendingTitle);
          await expect(submit(page)).toHaveText(copy.pendingButton);
          await expect(submit(page)).toBeDisabled();
          await expect(nameField(page)).toBeDisabled();
          await expect(page.getByTestId('create-workspace-pending-notice')).toHaveText(
            copy.pendingNotice,
          );
          await expectScreenshot(page, `ws-02-1440-${colorScheme}`);
        });

        test(`WS-03 could not confirm matches the design (${colorScheme})`, async ({
          page,
        }, testInfo) => {
          await openForm(page, uniqueEmail(testInfo, `qa105-ws03-${colorScheme}`));
          await page.route('**/api/workspaces', (route) =>
            route.request().method() === 'POST'
              ? route.fulfill({
                  status: 503,
                  contentType: 'application/json',
                  body: JSON.stringify({ code: 'INTERNAL_ERROR' }),
                })
              : route.fallback(),
          );
          await submit(page).click();

          await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.failedTitle);
          await expect(page.getByTestId('create-workspace-failed')).toHaveText(copy.failedNotice);
          await expect(submit(page)).toHaveText(copy.retry);
          await expect(page.getByTestId('create-workspace-back')).toHaveText(copy.back);
          await expect(nameField(page)).toHaveValue(workspaceName);
          await expectScreenshot(page, `ws-03-1440-${colorScheme}`);
        });

        test(`WS-05 new workspace matches the design (${colorScheme})`, async ({
          page,
        }, testInfo) => {
          await openForm(
            page,
            uniqueEmail(testInfo, `qa105-ws05-${colorScheme}`),
            '/workspaces/new?from=chooser',
          );
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.newTitle);
          await expect(page.getByTestId('create-workspace-back-to-list')).toHaveText(
            copy.backToList,
          );
          await expect(page.getByTestId('create-workspace-invite-notice')).toHaveCount(0);
          await expect(page.getByTestId('create-workspace-sign-out')).toHaveCount(0);
          await expectScreenshot(page, `ws-05-1440-${colorScheme}`);
        });
      });

      test.describe('360 px', () => {
        test.use({ viewport: { width: 360, height: 800 } });

        test(`WS-07 mobile matches the design (${colorScheme})`, async ({ page }, testInfo) => {
          await openForm(page, uniqueEmail(testInfo, `qa105-ws07-${colorScheme}`));
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
          // WS-07: no subtitle, the short invite line instead of the notice, a full-width sign-out.
          await expect(page.getByTestId('auth-subtitle')).toBeHidden();
          await expect(page.getByTestId('create-workspace-invite-notice')).toBeHidden();
          await expect(page.getByTestId('create-workspace-invite-short')).toHaveText(
            copy.inviteOnlyShort,
          );
          const signOut = await page.getByTestId('create-workspace-sign-out').boundingBox();
          const submitBox = await submit(page).boundingBox();
          expect(signOut?.width).toBe(submitBox?.width);
          expect(signOut?.height ?? 0).toBeGreaterThanOrEqual(44);
          await expectScreenshot(page, `ws-07-360-${colorScheme}`);
        });
      });
    });
  }
});
