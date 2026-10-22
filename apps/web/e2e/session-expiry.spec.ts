// Issue #82: signed-in routes are guarded, and a session that ends on the server mid-use sends the
// user to sign-in with `expired=1` and the page they were on. Runs against the real API and the
// Compose Postgres; the session row is deleted with psql. The sign-in screen is its own issue, so
// this checks URLs, not the sign-in page's copy.
import { expect, test } from '@playwright/test';
import { psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

test.describe('route guard', () => {
  test('opening / signed out lands on /sign-in?redirect=%2F', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/sign-in\?redirect=%2F$/);
    await expect(page.getByTestId('placeholder-page')).toHaveCount(0);
  });

  test('a signed-out deep link keeps its full path in redirect', async ({ page }) => {
    await page.goto('/jobs?status=open');

    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs%3Fstatus%3Dopen$/);
  });

  test('the auth pages open without a session', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password/abc']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });
});

test.describe('session expiry', () => {
  test('signed in, a deleted session sends the next API call to sign-in with expired=1', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa82');
    await signInAsNewUser(page, email);

    // Signed in: / opens, and /sign-in sends the user back to /.
    await page.goto('/');
    await expect(page.getByTestId('placeholder-page')).toBeVisible();
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/jobs$/);

    await page.goto('/jobs?status=open');
    await expect(page).toHaveURL(/\/jobs\?status=open$/);

    psql(
      `delete from session where user_id = (select id from "user" where email = ${sqlString(email)})`,
    );
    await page.evaluate(async (apiPath) => {
      const { api } = (await import(/* @vite-ignore */ apiPath)) as {
        api: { get: (path: string) => Promise<unknown> };
      };
      await api.get('/me').catch(() => undefined);
    }, '/src/lib/api.ts');

    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs%3Fstatus%3Dopen&expired=1$/);
    await page.screenshot({ path: testInfo.outputPath('expired.png'), fullPage: true });
  });
});
