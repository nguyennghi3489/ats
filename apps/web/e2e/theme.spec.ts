// Issue #36: light / dark / system theme. The resolved theme sits on <html data-theme>, `system`
// follows prefers-color-scheme live, the choice is kept in localStorage `ats.theme`, and an inline
// script in index.html applies it before the bundle runs (no light flash in dark mode).
// The account-menu control is step 5, so the tests drive the `window.atsTheme` handle from main.ts.
import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'ats.theme';

type ThemeHandle = { setTheme(pref: string): Promise<void> };

const html = (page: Page) => page.locator('html');

/** Seeds localStorage for the origin before any page script runs, on every navigation. */
async function storeOnEveryLoad(page: Page, value: string): Promise<void> {
  await page.addInitScript(([key, v]) => window.localStorage.setItem(key, v), [
    STORAGE_KEY,
    value,
  ] as const);
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(() => 'atsTheme' in window);
}

test.describe('theme', () => {
  test('system: OS dark gives data-theme="dark" on load and follows the OS live', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await waitForApp(page);

    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: test.info().outputPath('theme-system-dark.png'),
      fullPage: true,
    });

    const navigations: string[] = [];
    page.on('framenavigated', (f) => navigations.push(f.url()));
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(navigations, 'no reload while following the OS').toEqual([]);
  });

  test("setTheme('light') survives a reload while the OS is dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await waitForApp(page);
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');

    await page.evaluate(() =>
      (window as unknown as { atsTheme: ThemeHandle }).atsTheme.setTheme('light'),
    );
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe('light');

    await page.reload();
    await waitForApp(page);
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    // An explicit choice ignores later OS changes too.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await page.screenshot({
      path: test.info().outputPath('theme-light-os-dark.png'),
      fullPage: true,
    });
  });

  test('stored dark is applied before the bundle runs (no light flash)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await storeOnEveryLoad(page, 'dark');
    // Record every data-theme change on <html> and what had been parsed or booted at that moment.
    await page.addInitScript(() => {
      const log: { value: string | null; body: boolean; app: boolean }[] = [];
      (window as unknown as { themeLog: typeof log }).themeLog = log;
      // Synchronous hook: both the inline script and theme.ts call setAttribute on <html>.
      const original = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name: string, value: string) {
        if (this === document.documentElement && name === 'data-theme') {
          log.push({ value, body: document.body !== null, app: 'atsTheme' in window });
        }
        return original.call(this, name, value);
      };
    });

    await page.goto('/');
    await waitForApp(page);
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    const log = await page.evaluate(
      () =>
        (window as unknown as { themeLog: { value: string; body: boolean; app: boolean }[] })
          .themeLog,
    );
    expect(log.length).toBeGreaterThan(0);
    // The first value ever set is dark, before <body> exists and before the app booted.
    expect(log[0]).toEqual({ value: 'dark', body: false, app: false });
    expect(
      log.map((e) => e.value).every((v) => v === 'dark'),
      'never light',
    ).toBe(true);
  });

  test('stored dark is applied even if the bundle never runs', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await storeOnEveryLoad(page, 'dark');
    await page.route('**/src/main.ts*', (route) => route.abort());
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => 'atsTheme' in window)).toBe(false);
  });

  for (const garbage of ['blue', 'Dark', '', '{"theme":"dark"}']) {
    test(`garbage ats.theme=${JSON.stringify(garbage)} behaves like system`, async ({ page }) => {
      await storeOnEveryLoad(page, garbage);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');
      await waitForApp(page);
      await expect(html(page)).toHaveAttribute('data-theme', 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(html(page)).toHaveAttribute('data-theme', 'light');
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { atsTheme: { preference: { value: string } } }).atsTheme
              .preference.value,
        ),
      ).toBe('system');
    });
  }
});
