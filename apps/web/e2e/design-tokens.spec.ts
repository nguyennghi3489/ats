// Issue #35: design tokens and Be Vietnam Pro, checked in a real browser against the values sampled
// from docs/design/01-foundations ("ATS / Foundations", "Light specimen", "Dark specimen",
// "Opacity token unit verification").
import { expect, test, type Page } from '@playwright/test';
import { signInAsNewMember, uniqueEmail } from './support/session';

const LIGHT = {
  canvas: 'rgb(247, 247, 242)', // #F7F7F2
  ink: 'rgb(41, 40, 34)', // #292822
};
const DARK = {
  canvas: 'rgb(34, 35, 32)', // #222320
  ink: 'rgb(244, 241, 232)', // #F4F1E8
};

// Palette from the "ATS / Foundations" swatches and the specimens' semantic aliases.
const LIGHT_TOKENS: Record<string, string> = {
  '--color-canvas': '#f7f7f2',
  '--color-surface': '#ffffff',
  '--color-ink': '#292822',
  '--color-muted': '#66645d',
  '--color-line': '#b1afa5',
  '--color-sidebar': '#eee9fb',
  '--color-accent': '#e7e1fb',
  '--color-action': '#d7ed99',
  '--color-danger': '#a42929',
  '--color-field-surface': '#fcfcfa',
  '--color-info-surface': '#e7e1fb',
  '--color-success-surface': '#e4f0d3',
  '--color-error-surface': '#f8e2df',
  '--opacity-disabled': '0.45',
  '--touch-target-min': '44px',
  '--focus-ring-width': '3px',
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-6': '24px',
  '--space-8': '32px',
};
const DARK_TOKENS: Record<string, string> = {
  '--color-canvas': '#222320',
  '--color-surface': '#2a2b27',
  '--color-field-surface': '#32332e',
  '--color-ink': '#f4f1e8',
  '--color-info-surface': '#494252',
  '--color-success-surface': '#2a2b27',
  '--color-error-surface': '#2a2b27',
  '--color-focus-ring': '#f4f1e8',
};

async function readTokens(page: Page, names: string[]) {
  return page.evaluate((list) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(list.map((n) => [n, style.getPropertyValue(n).trim().toLowerCase()]));
  }, names);
}

async function bodyColours(page: Page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { canvas: s.backgroundColor, ink: s.color };
  });
}

async function openHome(page: Page) {
  // `/` needs a session since #82.
  await signInAsNewMember(page, uniqueEmail(test.info(), 'qa-tokens'));
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
}

test.describe('design tokens (#35)', () => {
  test('exposes the light palette from the design on :root', async ({ page }) => {
    await openHome(page);
    expect(await readTokens(page, Object.keys(LIGHT_TOKENS))).toEqual(LIGHT_TOKENS);
    expect(await bodyColours(page)).toEqual(LIGHT);
  });

  test('switches background and text to the dark specimen without a reload', async ({ page }) => {
    await openHome(page);
    // A marker on window survives only if the page is not reloaded.
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    let navigations = 0;
    page.on('framenavigated', () => navigations++);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect.poll(() => bodyColours(page)).toEqual(DARK);
    expect(await readTokens(page, Object.keys(DARK_TOKENS))).toEqual(DARK_TOKENS);

    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await expect.poll(() => bodyColours(page)).toEqual(LIGHT);

    expect(navigations).toBe(0);
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);
  });

  test('renders Vietnamese text in self-hosted Be Vietnam Pro', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL!).origin;
    const fontRequests: string[] = [];
    const foreignRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'data:') return;
      if (url.origin !== appOrigin) foreignRequests.push(request.url());
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });

    await openHome(page);
    await page.evaluate(() => {
      const h = document.createElement('h2');
      h.id = 'vi-sample';
      h.textContent = 'Nội dung đăng tuyển';
      document.querySelector('[data-testid="home-page"]')!.append(h);
    });
    await page.evaluate(async () => {
      await document.fonts.load('400 14px "Be Vietnam Pro"', 'Nội dung đăng tuyển');
      await document.fonts.ready;
    });

    // The devtools "Rendered fonts" panel reads the same CDP call.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '#vi-sample',
    });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.familyName).toBe('Be Vietnam Pro');
      expect(font.isCustomFont).toBe(true);
    }

    expect(fontRequests.length).toBeGreaterThan(0);
    expect(fontRequests.some((u) => /be-vietnam-pro-vietnamese-/.test(u))).toBe(true);
    for (const u of fontRequests) expect(new URL(u).origin).toBe(appOrigin);
    expect(foreignRequests).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`tabbing to a link and a button shows the token focus ring (${theme})`, async ({
      page,
    }, testInfo) => {
      await openHome(page);
      await page.evaluate((t) => {
        if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        const main = document.querySelector('[data-testid="home-page"]')!;
        const a = document.createElement('a');
        a.href = '#job';
        a.id = 'focus-link';
        a.textContent = 'Nội dung đăng tuyển';
        const b = document.createElement('button');
        b.id = 'focus-button';
        b.textContent = 'Lưu thay đổi';
        b.style.margin = '16px';
        main.append(a, b);
      }, theme);
      const ring = theme === 'dark' ? DARK.ink : LIGHT.ink;
      const outline = (sel: string) =>
        page.locator(sel).evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            style: s.outlineStyle,
            width: s.outlineWidth,
            color: s.outlineColor,
            offset: s.outlineOffset,
          };
        });

      await page.keyboard.press('Tab');
      await expect(page.locator('#focus-link')).toBeFocused();
      expect(await outline('#focus-link')).toEqual({
        style: 'solid',
        width: '3px',
        color: ring,
        offset: '0px',
      });

      await page.keyboard.press('Tab');
      await expect(page.locator('#focus-button')).toBeFocused();
      expect(await outline('#focus-button')).toEqual({
        style: 'solid',
        width: '3px',
        color: ring,
        offset: '0px',
      });
      await page.screenshot({ path: testInfo.outputPath(`focus-ring-${theme}.png`) });

      // A mouse click does not draw the ring (only :focus-visible does).
      await page.locator('#focus-link').click();
      expect((await outline('#focus-link')).style).toBe('none');
    });
  }
});
