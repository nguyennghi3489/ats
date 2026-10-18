// Issue #41: /dev/ui is registered only when import.meta.env.DEV is true, so a production build
// (`vite build` + `vite preview`) answers it with the 404 route and ships no gallery code.
// This spec builds the app into a temporary folder and serves it with `vite preview` on its own port.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.E2E_PREVIEW_PORT || 4179);
const previewURL = `http://localhost:${port}`;

let outDir = '';
let preview: ChildProcess | undefined;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`vite preview did not answer on ${url}`);
}

test.describe('UI gallery in a production build', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'ats-web-prod-'));
    const build = spawnSync(
      'pnpm',
      ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'],
      {
        cwd: webDir,
        encoding: 'utf8',
      },
    );
    expect(build.status, build.stderr || build.stdout).toBe(0);

    preview = spawn(
      'pnpm',
      ['exec', 'vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'],
      { cwd: webDir, stdio: 'ignore' },
    );
    await waitForServer(previewURL, 60_000);
  });

  test.afterAll(() => {
    preview?.kill();
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  test('/dev/ui answers with the 404 route', async ({ page }) => {
    await page.goto(`${previewURL}/dev/ui`);

    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
    await expect(page.getByTestId('ui-gallery')).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('ui-gallery-prod-404.png'),
      fullPage: true,
    });
  });

  test('the production bundle contains no gallery code', () => {
    const assets = join(outDir, 'assets');
    const js = readdirSync(assets)
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(join(assets, file), 'utf8'))
      .join('\n');

    expect(js).not.toContain('ui-gallery');
    expect(js).not.toContain('/dev/ui');
    expect(readdirSync(assets).some((file) => /UiGallery/.test(file))).toBe(false);
  });
});
