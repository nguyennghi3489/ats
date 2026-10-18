// Issue #33: the E2E harness starts the API and the web app; both answer, and the web dev server
// forwards `/api/*` to the API the same way the app's client calls it.
import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('the home page loads', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('home-page')).toBeVisible();
  });

  test('the API health check is reachable through the web proxy', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
