// Issue #114: AtsPageHeader and AtsPageBody, checked in the /dev/ui gallery (layout-demo-AtsPage) against
// the design page "02 · App shell" > ATS/Page wrapper, Example · Desktop list and Example · Mobile
// navigation closed. At 1440 px the action sits on the right of the title row; below 768 px the title
// comes first and the action fills the width under it. The components hold no copy (the caller passes
// translated text) and the gallery is developer tooling, so there is no vi/en variant.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: { ink: 'rgb(41, 40, 34)', muted: 'rgb(102, 100, 93)', line: 'rgb(177, 175, 165)' },
  dark: { ink: 'rgb(244, 241, 232)', muted: 'rgb(192, 190, 181)', line: 'rgb(118, 119, 108)' },
} as const;

type Example = 'list' | 'empty' | 'breadcrumb' | 'long-title';

const header = (page: Page, panel: 'light' | 'dark', example: Example) =>
  page
    .getByTestId('layout-demo-AtsPage')
    .locator(`[data-panel="${panel}"] [data-example="${example}"] .ats-page-header`);

function measure(root: Locator) {
  return root.evaluate((el) => {
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width };
    };
    const box = (sel: string) => {
      const node = el.querySelector(sel);
      return node ? rect(node) : null;
    };
    const s = getComputedStyle(el);
    const title = el.querySelector('.ats-page-header__title')!;
    const ts = getComputedStyle(title);
    const desc = el.querySelector('.ats-page-header__description');
    return {
      header: rect(el),
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      borderBottom: [s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor],
      colour: s.color,
      title: box('.ats-page-header__title')!,
      titleStyle: { size: ts.fontSize, weight: ts.fontWeight, lineHeight: ts.lineHeight },
      titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(ts.lineHeight)),
      titleOverflow: title.scrollWidth - title.clientWidth,
      description: desc
        ? { display: getComputedStyle(desc).display, colour: getComputedStyle(desc).color }
        : null,
      action: box('.ats-page-header__actions button'),
      overflowX: el.scrollWidth - el.clientWidth,
    };
  });
}

test.describe('page header and body', () => {
  test.describe('at 1440 px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the action sits on the right of the title row, inside the 40 px side inset', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      const root = header(page, 'light', 'list');
      await expect(root).toBeVisible();
      await expect(root.getByRole('heading', { level: 1 })).toHaveText('Vị trí tuyển dụng');

      const m = await measure(root);
      expect(m.padding).toEqual(['32px', '40px', '24px', '40px']);
      expect(m.borderBottom).toEqual(['1px', 'solid', TOKENS.light.line]);
      expect(m.titleStyle).toEqual({ size: '24px', weight: '700', lineHeight: '32px' });
      expect(m.title.left - m.header.left).toBeCloseTo(40, 0);
      const action = m.action!;
      expect(m.header.right - action.right).toBeCloseTo(40, 0);
      expect(action.left).toBeGreaterThan(m.title.right);
      // Same row: the action overlaps the title block vertically.
      expect(action.top).toBeLessThan(m.title.bottom);
      expect(m.description).toEqual({ display: 'block', colour: TOKENS.light.muted });
    });

    test('a long title wraps beside the action and never runs under it', async ({ page }) => {
      await page.goto('/dev/ui');
      const m = await measure(header(page, 'light', 'long-title'));

      expect(m.titleLines).toBeGreaterThan(1);
      expect(m.titleOverflow).toBe(0);
      expect(m.overflowX).toBe(0);
      expect(m.title.right).toBeLessThanOrEqual(m.action!.left);
    });

    test('the breadcrumb sits above the title', async ({ page }) => {
      await page.goto('/dev/ui');
      const root = header(page, 'light', 'breadcrumb');
      const crumb = root.locator('.ats-page-header__breadcrumb');
      await expect(crumb.getByRole('link', { name: 'Vị trí tuyển dụng' })).toBeVisible();

      const crumbBox = (await crumb.boundingBox())!;
      const titleBox = (await root.getByRole('heading', { level: 1 }).boundingBox())!;
      expect(crumbBox.y + crumbBox.height).toBeLessThanOrEqual(titleBox.y);
    });

    test('the dark panel takes the dark ink, muted and line tokens', async ({ page }) => {
      await page.goto('/dev/ui');
      const m = await measure(header(page, 'dark', 'list'));

      expect(m.colour).toBe(TOKENS.dark.ink);
      expect(m.borderBottom).toEqual(['1px', 'solid', TOKENS.dark.line]);
      expect(m.description!.colour).toBe(TOKENS.dark.muted);
    });

    test('the body variants: flush table edge to edge, centred empty state, padded default', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      const panel = page.getByTestId('layout-demo-AtsPage').locator('[data-panel="light"]');

      const flush = panel.locator('[data-example="list"] .ats-page-body--flush');
      const flushBox = (await flush.boundingBox())!;
      const tableBox = (await flush.locator('table').boundingBox())!;
      expect(tableBox.x).toBeCloseTo(flushBox.x, 0);
      expect(tableBox.width).toBeCloseTo(flushBox.width, 0);

      const centered = panel.locator('[data-example="empty"] .ats-page-body--centered');
      const centredBox = (await centered.boundingBox())!;
      const emptyBox = (await centered.locator('.ats-empty-state').boundingBox())!;
      expect(emptyBox.x + emptyBox.width / 2).toBeCloseTo(centredBox.x + centredBox.width / 2, 0);
      expect(emptyBox.y + emptyBox.height / 2).toBeCloseTo(centredBox.y + centredBox.height / 2, 0);

      const padded = panel.locator('[data-example="breadcrumb"] .ats-page-body--default');
      expect(await padded.evaluate((el) => getComputedStyle(el).padding)).toBe('24px 40px');
    });
  });

  test.describe('at 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the title comes first and the action fills the width under it, without the description', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      for (const example of ['list', 'long-title'] as const) {
        const root = header(page, 'light', example);
        await root.scrollIntoViewIfNeeded();
        const m = await measure(root);

        expect(m.padding).toEqual(['24px', '20px', '0px', '20px']);
        expect(m.borderBottom[0]).toBe('0px');
        expect(m.description).toEqual({ display: 'none', colour: TOKENS.light.muted });
        const action = m.action!;
        expect(action.top, `${example}: action under the title`).toBeGreaterThanOrEqual(
          m.title.bottom,
        );
        expect(action.left - m.header.left).toBeCloseTo(20, 0);
        expect(action.width).toBeCloseTo(m.header.width - 40, 0);
        expect(m.titleOverflow).toBe(0);
        expect(m.overflowX).toBe(0);
      }
    });
  });
});
