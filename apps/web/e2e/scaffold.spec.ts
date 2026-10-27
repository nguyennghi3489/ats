// Issue #28: the scaffolded web app serves the home page (the jobs list since #127) and a 404 route.
// Runs against `pnpm --filter web dev` (or `preview` of the built bundle).
import { expect, test } from '@playwright/test';
import { signInAsNewMember, uniqueEmail } from './support/session';

test.describe('web scaffold', () => {
  test('serves the home page at /', async ({ page }, testInfo) => {
    // `/` needs a session since #82, and opens /jobs inside the app layout since #113.
    await signInAsNewMember(page, uniqueEmail(testInfo, 'qa-scaffold'));
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vị trí tuyển dụng');
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('home.png'), fullPage: true });
  });

  test('shows the 404 route for an unknown URL', async ({ page }, testInfo) => {
    // Signed out, an unknown URL goes to /sign-in like any private one (#82, #88).
    await signInAsNewMember(page, uniqueEmail(testInfo, 'qa-scaffold'));
    await page.goto('/this/route/does-not-exist');

    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('404');
    await expect(page.getByTestId('jobs-list-page')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('not-found.png'), fullPage: true });
  });

  test('the 404 page links back to the home page', async ({ page }, testInfo) => {
    await signInAsNewMember(page, uniqueEmail(testInfo, 'qa-scaffold'));
    await page.goto('/unknown');
    await page.getByTestId('not-found-home-link').click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByTestId('jobs-list-page')).toBeVisible();
  });
});
