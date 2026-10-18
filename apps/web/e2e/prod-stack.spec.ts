// Issue #39: the production Compose stack (docker-compose.prod.yml) serves the web app over HTTPS through
// Caddy, proxies /api/* to the API with the prefix stripped, and redirects HTTP to HTTPS.
// Opt-in: runs only when E2E_PROD_URL points at a running prod stack, for example on a laptop
// (see docs/deploy.md, "Trying the stack on a laptop"):
//
//   docker compose -f docker-compose.prod.yml --env-file .env.prod.local up -d --wait
//   E2E_PROD_URL=https://localhost pnpm test:e2e prod-stack
//
// With DOMAIN=localhost Caddy signs with its own local CA, so certificate errors are ignored here.
import { expect, test } from '@playwright/test';

const prodURL = process.env.E2E_PROD_URL?.replace(/\/$/, '') ?? '';

test.describe('production stack through Caddy', () => {
  test.skip(!prodURL, 'E2E_PROD_URL is not set (no production stack to test)');
  test.use({ baseURL: prodURL, ignoreHTTPSErrors: true });

  test('https://<domain>/ serves the web app', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(response?.url()).toMatch(/^https:\/\//);

    const headers = response?.headers() ?? {};
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['server']).toBeUndefined();

    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'ATS' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('prod-home.png'), fullPage: true });
  });

  test('a deep link opened directly boots the app (SPA fallback behind Caddy)', async ({
    page,
  }) => {
    const response = await page.goto('/jobs/123');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/jobs\/123$/);
    await expect(page.locator('#app main')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('prod-deep-link.png'), fullPage: true });
  });

  test('the API health endpoint answers 200 at /api/health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('the /api prefix goes to the API, not to the web fallback', async ({ request }) => {
    const response = await request.get('/api/does-not-exist');
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type'] ?? '').not.toContain('text/html');
  });

  test('plain HTTP redirects to HTTPS', async ({ request }) => {
    const httpURL = prodURL.replace(/^https:/, 'http:');
    const response = await request.get(`${httpURL}/jobs/123`, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(response.status());
    expect(response.headers()['location']).toBe(`${prodURL}/jobs/123`);
  });
});
