// Issue #28: the scaffolded web app serves a placeholder home page and a 404 route.
// Runs against `pnpm --filter web dev` (or `preview` of the built bundle).
import { expect, test } from '@playwright/test';

test.describe('web scaffold', () => {
  test('serves the placeholder home page at /', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ATS');
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('home.png'), fullPage: true });
  });

  test('shows the 404 route for an unknown URL', async ({ page }) => {
    await page.goto('/this/route/does-not-exist');

    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('404');
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('not-found.png'), fullPage: true });
  });

  test('the 404 page links back to the home page', async ({ page }) => {
    await page.goto('/unknown');
    await page.getByTestId('not-found-home-link').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home-page')).toBeVisible();
  });
});
