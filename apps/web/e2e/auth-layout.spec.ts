// Issue #80: the auth page layout and its VI / EN switch, checked on the /dev/ui gallery demo.
// The card is centred at 1440 px and fills a real 360 px viewport (the @media rules only apply to the
// viewport, not to the gallery's 360 px panel); the switch changes every visible word, sets <html lang>
// and survives a reload (decisions §12); it is keyboard reachable with a visible focus ring; and the
// demo renders in light and dark theme.
// The light / dark baselines live in auth-layout.spec.ts-snapshots/, one per platform: `-linux` is what
// CI compares against (made in the mcr.microsoft.com/playwright image of the installed version), and
// `-darwin` serves local runs on macOS. Refresh both with `--update-snapshots` after a visual change.
import { expect, test, type Locator, type Page } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };

const LOCALE_KEY = 'ats.locale';

// Sample copy of the gallery demo (src/dev/UiGallery.vue).
const SAMPLE = {
  vi: {
    title: 'Đăng nhập',
    subtitle: 'Tiếp tục vào tài khoản nhà tuyển dụng.',
    password: 'Mật khẩu',
  },
  en: { title: 'Sign in', subtitle: 'Continue to your employer account.', password: 'Password' },
} as const;

const demo = (page: Page) => page.getByTestId('auth-layout-demo');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const page_ = (p: Locator) => p.locator('.auth-layout');
const card = (p: Locator) => p.locator('.auth-layout__card');
const switchGroup = (p: Locator, name: string) => p.getByRole('group', { name });

async function open(page: Page): Promise<void> {
  await page.goto('/dev/ui');
  // The gallery renders every component demo first, which can take a while on a busy machine.
  await expect(demo(page)).toBeVisible({ timeout: 30_000 });
}

/** Checks that every visible word of a demo panel is in the given language. */
async function expectLanguage(p: Locator, lang: 'vi' | 'en'): Promise<void> {
  const other = lang === 'vi' ? 'en' : 'vi';
  const dict = lang === 'vi' ? vi : en;
  await expect(p.getByRole('heading', { level: 1 })).toHaveText(SAMPLE[lang].title);
  await expect(p.getByTestId('auth-subtitle')).toHaveText(SAMPLE[lang].subtitle);
  await expect(p.locator('.auth-layout__brand-name')).toHaveText(dict.auth.layout.brand);
  await expect(p.getByLabel(SAMPLE[lang].password, { exact: true })).toBeVisible();
  await expect(switchGroup(p, dict.auth.layout.language)).toBeVisible();
  await expect(p).not.toContainText(SAMPLE[other].subtitle);
}

test.describe('Auth layout (AuthLayout + LanguageSwitch)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);
  // A Vietnamese browser, so the page starts in Vietnamese when nothing is stored (decisions §12).
  test.use({ locale: 'vi-VN' });

  test('1440 px: the card is 448 wide and horizontally centred on the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      await p.scrollIntoViewIfNeeded();
      const outer = (await page_(p).boundingBox())!;
      const box = (await card(p).boundingBox())!;
      expect(box.width, `${id}: card max width`).toBe(448);
      const left = box.x - outer.x;
      const right = outer.x + outer.width - (box.x + box.width);
      expect(Math.abs(left - right), `${id}: centred on the auth page`).toBeLessThanOrEqual(1);
      expect(left, `${id}: desktop, so wide margins on both sides`).toBeGreaterThan(400);
    }
  });

  test('360 px viewport: the card fills the width with page padding, no horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);

    const p = panel(page, 'light');
    await p.scrollIntoViewIfNeeded();
    const outer = (await page_(p).boundingBox())!;
    const box = (await card(p).boundingBox())!;
    // Mobile rules from the viewport media query: 16 px page padding, 24 px card inset.
    expect(Math.round(box.x - outer.x), 'left page padding').toBe(16);
    expect(Math.round(outer.x + outer.width - (box.x + box.width)), 'right page padding').toBe(16);
    expect(await card(p).evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('24px');
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    // Switch options are touch targets at this width.
    for (const option of await switchGroup(p, vi.auth.layout.language).getByRole('button').all()) {
      const b = (await option.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }

    // The component demos above keep a fixed 360 px panel inside the gallery padding, which overflows a
    // 360 px viewport on its own. Hide them so the page holds only the auth layout, as a real auth page.
    await page.addStyleTag({ content: '[data-testid^="ui-demo-"] { display: none !important; }' });
    const sizes = await page.evaluate(() => {
      const root = document.documentElement;
      const over = [...document.querySelectorAll('[data-testid="auth-layout-demo"] *')]
        .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 0.5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      return { scroll: root.scrollWidth, client: root.clientWidth, over };
    });
    expect(sizes.over, 'nothing in the auth layout sticks out to the right').toEqual([]);
    expect(sizes.scroll, 'no horizontal scrolling').toBeLessThanOrEqual(sizes.client);
    await page.screenshot({ path: test.info().outputPath('auth-layout-360.png'), fullPage: true });
  });

  test('EN switches the text and <html lang>, a reload keeps English, VI switches back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const p = panel(page, 'light');
    await p.scrollIntoViewIfNeeded();

    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expectLanguage(p, 'vi');
    const group = switchGroup(p, vi.auth.layout.language);
    await expect(group.getByRole('button', { name: vi.auth.layout.viName })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await group.getByRole('button', { name: vi.auth.layout.enName }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    for (const id of ['light', 'dark', 'mobile'] as const)
      await expectLanguage(panel(page, id), 'en');
    expect(await page.evaluate((k) => localStorage.getItem(k), LOCALE_KEY)).toBe('en');

    await page.reload();
    await expect(demo(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectLanguage(p, 'en');
    const enGroup = switchGroup(p, en.auth.layout.language);
    await expect(enGroup.getByRole('button', { name: en.auth.layout.enName })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await enGroup.getByRole('button', { name: en.auth.layout.viName }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expectLanguage(p, 'vi');
    expect(await page.evaluate((k) => localStorage.getItem(k), LOCALE_KEY)).toBe('vi');
  });

  test('the switch is reachable by keyboard, shows the focus ring and exposes the pressed state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const p = panel(page, 'light');
    await p.scrollIntoViewIfNeeded();

    const viOption = p.getByRole('button', { name: vi.auth.layout.viName });
    const enOption = p.getByRole('button', { name: vi.auth.layout.enName });

    // Start in the email field right after the card header, then go back with the keyboard:
    // the switch sits in the tab order just before the form.
    await p.getByLabel('Email', { exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(enOption).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(viOption).toBeFocused();

    const ring = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        focusVisible: el.matches(':focus-visible'),
        style: s.outlineStyle,
        width: s.outlineWidth,
        color: s.outlineColor,
      };
    };
    expect(await viOption.evaluate(ring)).toEqual({
      focusVisible: true,
      style: 'solid',
      width: '3px',
      color: 'rgb(41, 40, 34)',
    });
    await expect(viOption).toHaveAttribute('aria-pressed', 'true');
    await expect(enOption).toHaveAttribute('aria-pressed', 'false');

    // Next Tab moves to EN with the ring; Space picks it.
    await page.keyboard.press('Tab');
    await expect(enOption).toBeFocused();
    expect((await enOption.evaluate(ring)).focusVisible).toBe(true);
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const enNow = p.getByRole('button', { name: en.auth.layout.enName });
    await expect(enNow).toHaveAttribute('aria-pressed', 'true');
    await expect(p.getByRole('button', { name: en.auth.layout.viName })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(enNow).toBeFocused();
    expect((await enNow.evaluate(ring)).style).toBe('solid');
  });

  test('light and dark demo panels render as expected', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    // Fonts and theme settle before the capture.
    await page.evaluate(() => document.fonts.ready);

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      await p.scrollIntoViewIfNeeded();
      await expect(card(p)).toBeVisible();
      await expect(p).toHaveScreenshot(`auth-layout-${id}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});

// QA additions for #80: the default language follows the browser (decisions §12), the card sits in the
// middle of the page like the 1440 px desktop example, and vi / en captures of the demo for comparing
// with the design screens (03-authentication-onboarding, desktop-example-sign-in and AUTH-07).
test.describe('Auth layout: QA checks against decisions §12 and the design', () => {
  test.setTimeout(60_000);
  test.use({ locale: 'vi-VN' });

  // Shows only the light auth demo, without gallery padding, so it fills the viewport like a real page.
  const ONLY_LIGHT_DEMO =
    '[data-testid^="ui-demo-"], .ui-gallery__title, [data-testid="auth-layout-demo"] > h2,' +
    ' [data-panel="dark"], [data-panel="mobile"], [data-panel="light"] > h3' +
    ' { display: none !important; }' +
    ' .ui-gallery, .ui-gallery__demo, .ui-gallery__panels { padding: 0 !important; margin: 0 !important;' +
    ' border: 0 !important; gap: 0 !important; }';

  const pickEn = (p: Locator) =>
    switchGroup(p, vi.auth.layout.language)
      .getByRole('button', { name: vi.auth.layout.enName })
      .click();

  for (const [browserLocale, expected] of [
    ['en-US', 'en'],
    ['vi-VN', 'vi'],
    ['fr-FR', 'vi'],
  ] as const) {
    test(`a ${browserLocale} browser with nothing stored starts in ${expected}`, async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        locale: browserLocale,
        baseURL,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      const p = panel(page, 'light');
      await expectLanguage(p, expected);
      const dict = expected === 'vi' ? vi : en;
      const name = expected === 'vi' ? dict.auth.layout.viName : dict.auth.layout.enName;
      await expect(p.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
      await context.close();
    });
  }

  test('1440 px: brand and switch share the header row; the card is centred both ways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.addStyleTag({ content: ONLY_LIGHT_DEMO });
    const p = panel(page, 'light');
    await expect(p.locator('.auth-layout__mark')).toHaveText('A');
    await expect(p.locator('.auth-layout__brand-name')).toHaveText('ATS nhà tuyển dụng');

    const brand = (await p.getByTestId('auth-brand').boundingBox())!;
    const sw = (await switchGroup(p, vi.auth.layout.language).boundingBox())!;
    const box = (await card(p).boundingBox())!;
    // Switch on the brand row, right-aligned inside the card: 1 px border + 32 px inset (issue context).
    expect(Math.abs(brand.y + brand.height / 2 - (sw.y + sw.height / 2))).toBeLessThanOrEqual(2);
    expect(Math.round(box.x + box.width - (sw.x + sw.width))).toBe(33);
    // Desktop example: 448 px card centred on the 1440 px page, vertically too.
    expect(box.width).toBe(448);
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(1);
    const outer = (await page_(p).boundingBox())!;
    const top = box.y - outer.y;
    const bottom = outer.y + outer.height - (box.y + box.height);
    expect(Math.abs(top - bottom), 'vertically centred').toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('qa-auth-1440-vi.png') });
    await pickEn(p);
    await expectLanguage(p, 'en');
    await page.screenshot({ path: test.info().outputPath('qa-auth-1440-en.png') });
  });

  test('360 px: vi and en captures with no horizontal scroll in either language', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await page.addStyleTag({ content: ONLY_LIGHT_DEMO });
    const p = panel(page, 'light');
    for (const lang of ['vi', 'en'] as const) {
      if (lang === 'en') await pickEn(p);
      await expectLanguage(p, lang);
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll, `${lang}: no horizontal scrolling`).toBeLessThanOrEqual(client);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath(`qa-auth-360-${lang}.png`),
        fullPage: true,
      });
    }
  });

  test('dark theme: vi and en captures of the demo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    const p = panel(page, 'dark');
    await p.scrollIntoViewIfNeeded();
    await expectLanguage(p, 'vi');
    await p.screenshot({ path: test.info().outputPath('qa-auth-dark-vi.png') });
    await switchGroup(p, vi.auth.layout.language)
      .getByRole('button', { name: vi.auth.layout.enName })
      .click();
    await expectLanguage(p, 'en');
    await p.screenshot({ path: test.info().outputPath('qa-auth-dark-en.png') });
  });
});
