// Issue #34: the web server falls back to index.html for any path that is not a file, so a deep link
// opened directly (bookmark, reload, link in an email) loads the app instead of a server 404.
// Runs against the Vite dev server by default, and against the web image with
// E2E_BASE_URL pointing at the container (e.g. `docker run -p 8080:8080 ats-web`).
import { expect, test } from '@playwright/test';

const deepLink = '/jobs/123';

test.describe('deep links', () => {
  test('the server returns index.html for a deep link', async ({ request }) => {
    const response = await request.get(deepLink);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('<div id="app"></div>');

    // Same document as the root, so the router decides what the path shows.
    const root = await request.get('/');
    expect(body).toBe(await root.text());
  });

  test('opening a deep link boots the app and keeps the URL', async ({ page }) => {
    const response = await page.goto(deepLink);
    expect(response?.status()).toBe(200);

    await expect(page).toHaveURL(new RegExp(`${deepLink}$`));
    // The app is mounted: the router renders a view inside #app (no job route exists yet, so 404 view).
    await expect(page.locator('#app main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('deep-link.png'), fullPage: true });

    // A reload on the deep link still loads the app.
    const reloaded = await page.reload();
    expect(reloaded?.status()).toBe(200);
    await expect(page.locator('#app main')).toBeVisible();
  });

  test('client-side navigation from a deep link reaches the home page', async ({ page }) => {
    await page.goto(deepLink);
    await page.getByRole('link', { name: 'ATS' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home-page')).toBeVisible();
  });
});
