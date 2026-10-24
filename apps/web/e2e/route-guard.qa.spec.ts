// QA for issue #82, against the real API and the Compose Postgres: the edges the issue spec
// (session-expiry.spec.ts) does not walk through in a browser. Design screens: none for this issue.
import { expect, test, type Page } from '@playwright/test';
import { psql, signInAsNewMember, sqlString, uniqueEmail } from './support/session';

function deleteSessionsOf(email: string) {
  psql(
    `delete from session where user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
}

/** Fires `paths` through the app's own API client in parallel and waits for all of them. */
async function parallelApiCalls(page: Page, paths: string[]) {
  await page.evaluate(
    async ([apiPath, list]) => {
      const { api } = (await import(/* @vite-ignore */ apiPath)) as {
        api: { get: (path: string) => Promise<unknown> };
      };
      await Promise.allSettled(list.map((p) => api.get(p)));
    },
    ['/src/lib/api.ts', paths] as const,
  );
}

test.describe('route guard (QA #82)', () => {
  test('signed in, /sign-up also goes to /', async ({ page }, testInfo) => {
    await signInAsNewMember(page, uniqueEmail(testInfo, 'qa82-signup'));

    await page.goto('/sign-up');
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();
  });

  test('signed out, every public auth route opens without a redirect', async ({ page }) => {
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/verify-email?email=an%40example.test',
      '/verify-email/tok-123',
      '/forgot-password',
      '/reset-password?token=tok-123',
      '/reset-password/invalid',
      '/reset-password/tok-123',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, '\\?')}$`));
    }
  });

  test('three parallel 401s after the session row is deleted navigate once', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa82-parallel');
    await signInAsNewMember(page, email);
    await page.goto('/jobs?status=open');
    await expect(page).toHaveURL(/\/jobs\?status=open$/);
    const before = await page.evaluate(() => history.length);

    deleteSessionsOf(email);
    await parallelApiCalls(page, ['/me', '/me', '/me']);

    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs%3Fstatus%3Dopen&expired=1$/);
    // One push adds exactly one history entry.
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    // Back to the protected page is guarded again, now as a plain signed-out visit.
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs%3Fstatus%3Dopen$/);
    await page.screenshot({ path: testInfo.outputPath('parallel-expired.png'), fullPage: true });
  });

  test('a 401 while on a public auth page does not redirect', async ({ page }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa82-public');
    await signInAsNewMember(page, email);
    await page.goto('/reset-password/tok-123');
    await expect(page).toHaveURL(/\/reset-password\/tok-123$/);

    deleteSessionsOf(email);
    await parallelApiCalls(page, ['/me']);

    // Give a stray navigation the chance to happen before asserting it did not.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/reset-password\/tok-123$/);
  });

  test('after expiry, opening a protected page lands on sign-in without expired', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa82-reload');
    await signInAsNewMember(page, email);
    deleteSessionsOf(email);

    await page.goto('/candidates?page=2');
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fcandidates%3Fpage%3D2$/);
  });
});
