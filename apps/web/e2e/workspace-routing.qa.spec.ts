// QA for issue #107: where a signed-in user lands (`/welcome` WS-06, their only workspace, or the
// chooser WS-04), checked against the real API, the Compose Postgres and Mailpit with fresh
// synthetic users. Complements workspace-routing.spec.ts with the real sign-up → verification link →
// sign-in path, deep links through the sign-in redirect, the en copy, and WS-06 at 1440 px and
// 360 px in light and dark.
//
// The WS-06 baselines live in workspace-routing.qa.spec.ts-snapshots/, one per platform: `-linux` is
// what CI compares against (made in the mcr.microsoft.com/playwright image of the installed version),
// `-darwin` serves local runs on macOS. Refresh both with `--update-snapshots` after a visual change.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo } from './support/mailpit';
import { createWorkspace, signInAsNewUser, uniqueEmail } from './support/session';

const password = 'qa-Password-e2e!';

async function activeWorkspaceId(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/workspaces');
  expect(response.status(), 'GET /api/workspaces').toBe(200);
  return ((await response.json()) as { activeWorkspaceId: string | null }).activeWorkspaceId;
}

/** Fills the sign-in form already on screen. */
async function submitSignIn(page: Page, email: string): Promise<void> {
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

/** Drops the session, opens `path` signed out and signs in through the form it redirects to. */
async function signInThrough(page: Page, email: string, path: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto(path);
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  await submitSignIn(page, email);
}

async function expectWelcomeCopy(page: Page, copy: typeof vi.workspaces.welcome): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
  await expect(page.getByTestId('auth-subtitle')).toHaveText(copy.subtitle);
  const notice = page.getByTestId('welcome-notice');
  await expect(notice).toContainText(copy.notice);
  await expect(notice).toHaveClass(/ats-notice--info/);
  await expect(page.getByRole('button', { name: copy.create })).toBeVisible();
  await expect(page.getByTestId('welcome-invite-hint')).toHaveText(copy.inviteHint);
}

test.describe('workspace routing (QA #107)', () => {
  test.use({ locale: 'vi-VN' });

  test('sign-up, the emailed verification link and sign-in land on /welcome (WS-06)', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-verify');

    await page.goto('/sign-up');
    await page.getByTestId('sign-up-name').fill('QA Routing');
    await page.getByTestId('sign-up-email').fill(email);
    await page.getByTestId('sign-up-password').fill(password);
    await page.getByTestId('sign-up-submit').click();
    await expect(page).toHaveURL(/\/verify-email\?email=/);

    const message = await latestMessageTo(email, { timeoutMs: 20_000 });
    const link = /https?:\/\/\S*\/verify-email\?token=[^\s"'<>)]+/.exec(message.text)?.[0];
    expect(link, 'verification link in the email').toBeTruthy();
    await page.goto(link!);
    await expect(page).toHaveURL(/\/verify-email\/success$/);
    await page.getByRole('button', { name: vi.auth.verified.signIn }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await submitSignIn(page, email);

    await expect(page).toHaveURL(/\/welcome$/);
    await expectWelcomeCopy(page, vi.workspaces.welcome);
  });

  test('WS-06 reads in English after switching the language, and "Create workspace" opens the form', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa107-en'));
    await page.goto('/welcome');
    await expectWelcomeCopy(page, vi.workspaces.welcome);

    // The auth layout's language switcher.
    await page
      .getByRole('group', { name: vi.auth.layout.language })
      .getByRole('button', { name: vi.auth.layout.enName })
      .click();
    await expectWelcomeCopy(page, en.workspaces.welcome);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal scrolling at ${viewport.width} px`).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: testInfo.outputPath(`ws-06-${viewport.width}-en.png`),
        fullPage: true,
      });
    }

    await page.getByRole('button', { name: en.workspaces.welcome.create }).click();
    await expect(page).toHaveURL(/\/workspaces\/new$/);
  });

  test('"Tạo không gian" is reached with Tab and opens /workspaces/new with Enter', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa107-kbd'));
    await page.goto('/welcome');
    const button = page.getByTestId('welcome-create');
    await expect(button).toBeVisible();

    for (
      let i = 0;
      i < 10 && !(await button.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/workspaces\/new$/);
  });

  test('a user without workspaces signing in from a deep link lands on /welcome, not in a loop', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-none-deep');
    await signInAsNewUser(page, email);

    await signInThrough(page, email, '/jobs?status=open');

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.welcome.title);
    // /workspaces/new and /workspaces stay where they are for this user.
    await page.goto('/workspaces/new');
    await expect(page).toHaveURL(/\/workspaces\/new$/);
    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/workspaces$/);
  });

  test('a signed-out visitor opening /welcome signs in and comes back to it', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-out');
    await signInAsNewUser(page, email);

    await page.context().clearCookies();
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fwelcome$/);
    await submitSignIn(page, email);

    await expect(page).toHaveURL(/\/welcome$/);
  });

  test('a user with one workspace and none active, signing in from a deep link, returns to it with the workspace active', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-one-deep');
    await signInAsNewUser(page, email);
    const id = await createWorkspace(page, 'An Nhiên');

    await signInThrough(page, email, '/jobs?status=open');

    await expect(page).toHaveURL(/\/jobs\?status=open$/);
    expect(await activeWorkspaceId(page)).toBe(id);
  });

  test('a user with two workspaces and none active, signing in at /, picks one on the chooser and lands on /', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa107-two-root');
    await signInAsNewUser(page, email);
    await createWorkspace(page, 'Mây Studio');
    const anId = await createWorkspace(page, 'An Nhiên');

    await signInThrough(page, email, '/');

    await expect(page).toHaveURL(/\/workspaces(\?redirect=%2F(jobs)?)?$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.choose.title);
    expect(await activeWorkspaceId(page)).toBeNull();
    await page.getByTestId('workspace-row').filter({ hasText: 'An Nhiên' }).click();

    // `/` opens /jobs inside the app layout (#113).
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
    expect(await activeWorkspaceId(page)).toBe(anId);
  });

  test('a user who creates a workspace elsewhere is sent from /welcome to / on the next visit', async ({
    page,
  }, testInfo) => {
    await signInAsNewUser(page, uniqueEmail(testInfo, 'qa107-later'));
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.workspaces.welcome.title);

    await createWorkspace(page, 'An Nhiên');
    await page.goto('/welcome');

    // `/` opens /jobs inside the app layout (#113).
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('app-layout')).toBeVisible();
  });
});

test.describe('WS-06 matches the design (QA #107)', () => {
  test.use({ locale: 'vi-VN' });

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 360, height: 800 },
    ]) {
      test.describe(`${viewport.width} px ${colorScheme}`, () => {
        test.use({ viewport });

        test(`WS-06 at ${viewport.width} px, ${colorScheme}`, async ({ page }, testInfo) => {
          await page.emulateMedia({ colorScheme });
          await signInAsNewUser(
            page,
            uniqueEmail(testInfo, `qa107-ws06-${viewport.width}-${colorScheme}`),
          );
          await page.goto('/welcome');
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
          await expectWelcomeCopy(page, vi.workspaces.welcome);

          // Design order: notice, then the full-width button, then the hint, 16 px apart.
          const notice = await page.getByTestId('welcome-notice').boundingBox();
          const button = await page.getByTestId('welcome-create').boundingBox();
          const hint = await page.getByTestId('welcome-invite-hint').boundingBox();
          expect(notice && button && hint).toBeTruthy();
          expect(button!.y).toBeGreaterThan(notice!.y + notice!.height);
          expect(hint!.y).toBeGreaterThan(button!.y + button!.height);
          expect(Math.round(button!.y - (notice!.y + notice!.height))).toBe(16);
          expect(Math.round(hint!.y - (button!.y + button!.height))).toBe(16);
          expect(Math.abs(button!.width - notice!.width)).toBeLessThanOrEqual(1);

          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          await page.evaluate(() => document.fonts.ready);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
          await expect(page).toHaveScreenshot(`ws-06-${viewport.width}-${colorScheme}.png`, {
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.02,
          });
        });
      });
    }
  }
});
