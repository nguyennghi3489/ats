// Issue #37: the app picks its language from the stored choice, then the browser language, then vi
// (decisions §12), and dates, money and API error codes format the same way in a real browser.
// The in-page checks import the app's own modules from the Vite dev server, so they run against
// `pnpm --filter web dev` (the default webServer), not the built web image.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };

const missingPath = '/khong-ton-tai';

interface I18nModule {
  setLocale: (locale: 'vi' | 'en') => void;
}

/** Calls the app's real `setLocale` in the page (same module instance the app uses). */
async function setLocaleInPage(page: Page, locale: 'vi' | 'en'): Promise<void> {
  await page.evaluate(
    async ([path, value]) => {
      const mod = (await import(/* @vite-ignore */ path)) as I18nModule;
      mod.setLocale(value as 'vi' | 'en');
    },
    ['/src/i18n/index.ts', locale] as const,
  );
}

test.describe('language from an English browser', () => {
  test.use({ locale: 'en-US' });

  test('the 404 page shows English and <html lang="en"> when nothing is stored', async ({
    page,
  }) => {
    await page.goto(missingPath);

    const notFound = page.getByTestId('not-found-page');
    await expect(page.getByTestId('not-found-title')).toHaveText(en.notFound.title);
    await expect(notFound).toContainText(en.notFound.description);
    await expect(page.getByTestId('not-found-home-link')).toHaveText(en.notFound.backHome);
    await expect(notFound).not.toContainText(vi.notFound.title);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => localStorage.getItem('ats.locale'))).toBeNull();

    await page.screenshot({ path: test.info().outputPath('404-en.png'), fullPage: true });
  });

  test('after setLocale("vi") the page switches and a reload keeps Vietnamese', async ({
    page,
  }) => {
    await page.goto(missingPath);
    await expect(page.getByTestId('not-found-title')).toHaveText(en.notFound.title);

    await setLocaleInPage(page, 'vi');

    // Live switch, without a reload.
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(await page.evaluate(() => localStorage.getItem('ats.locale'))).toBe('vi');

    await page.reload();

    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);
    await expect(page.getByTestId('not-found-home-link')).toHaveText(vi.notFound.backHome);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.screenshot({
      path: test.info().outputPath('404-vi-after-reload.png'),
      fullPage: true,
    });
  });
});

test.describe('language from a French browser', () => {
  test.use({ locale: 'fr' });

  test('the app shows Vietnamese when the browser language is neither vi nor en', async ({
    page,
  }) => {
    await page.goto(missingPath);

    const notFound = page.getByTestId('not-found-page');
    await expect(page.getByTestId('not-found-title')).toHaveText(vi.notFound.title);
    await expect(notFound).toContainText(vi.notFound.description);
    await expect(page.getByTestId('not-found-home-link')).toHaveText(vi.notFound.backHome);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

    await page.screenshot({ path: test.info().outputPath('404-fr-browser.png'), fullPage: true });
  });
});

test.describe('formatters and error codes in the browser', () => {
  test.use({ locale: 'en-US' });

  test('formatDate and formatMoney give the same output in both locales', async ({ page }) => {
    await page.goto(missingPath);

    const results = await page.evaluate(
      async ([indexPath, formatPath]) => {
        type Fmt = {
          formatDate: (value: Date) => string;
          formatMoney: (amount: number, currency: 'VND' | 'USD') => string;
        };
        const i18n = (await import(/* @vite-ignore */ indexPath)) as I18nModule;
        const fmt = (await import(/* @vite-ignore */ formatPath)) as Fmt;
        const out: Record<string, { date: string; money: string }> = {};
        for (const locale of ['vi', 'en'] as const) {
          i18n.setLocale(locale);
          out[locale] = {
            date: fmt.formatDate(new Date(2026, 2, 5)),
            money: fmt.formatMoney(25000000, 'VND'),
          };
        }
        return out;
      },
      ['/src/i18n/index.ts', '/src/i18n/format.ts'] as const,
    );

    expect(results).toEqual({
      vi: { date: '05/03/2026', money: '25.000.000 VND' },
      en: { date: '05/03/2026', money: '25,000,000 VND' },
    });
  });

  test('an unknown API error code is shown as errors.unknown, never the raw code', async ({
    page,
  }) => {
    await page.route('**/api/qa-unknown-error', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'QA_CODE_NOBODY_DEFINED', message: 'Developer hint' }),
      }),
    );
    await page.goto(missingPath);

    const results = await page.evaluate(
      async ([indexPath, apiPath]) => {
        type Api = {
          api: { get: (path: string) => Promise<unknown> };
        };
        const i18n = (await import(/* @vite-ignore */ indexPath)) as I18nModule;
        const { api } = (await import(/* @vite-ignore */ apiPath)) as Api;
        const error = (await api.get('/qa-unknown-error').catch((e: unknown) => e)) as {
          code: string;
          translate: () => string;
        };
        const out: Record<string, string> = { code: error.code };
        for (const locale of ['vi', 'en'] as const) {
          i18n.setLocale(locale);
          out[locale] = error.translate();
        }
        return out;
      },
      ['/src/i18n/index.ts', '/src/lib/api.ts'] as const,
    );

    expect(results.code).toBe('QA_CODE_NOBODY_DEFINED');
    expect(results.vi).toBe(vi.errors.unknown);
    expect(results.en).toBe(en.errors.unknown);
    for (const text of [results.vi, results.en]) {
      expect(text).not.toContain('QA_CODE_NOBODY_DEFINED');
      expect(text).not.toContain('Developer hint');
    }
  });
});
