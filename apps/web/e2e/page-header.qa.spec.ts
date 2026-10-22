// QA for issue #114: what page-header.spec.ts leaves out. The long title at 390 px (wraps, the action
// under it at full width), no overlap or truncation at the in-between widths 768, 1024 and 1280 px,
// one h1 per header, the empty and breadcrumb examples in the dark panel, and screenshots of the
// gallery examples at 1440 and 390 px, light and dark, for the comparison with
// "02 · App shell" > ATS/Page wrapper, Example · Desktop list and Example · Mobile navigation closed.
// The components hold no copy (callers pass translated text) and the gallery demo is developer
// tooling with fixed Vietnamese sample text, so there is no vi/en switch to exercise here.
import { expect, test, type Locator, type Page } from '@playwright/test';

type Panel = 'light' | 'dark';
type Example = 'list' | 'empty' | 'breadcrumb' | 'long-title';

const demo = (page: Page) => page.getByTestId('layout-demo-AtsPage');
const example = (page: Page, panel: Panel, name: Example) =>
  demo(page).locator(`[data-panel="${panel}"] [data-example="${name}"]`);
const header = (page: Page, panel: Panel, name: Example) =>
  example(page, panel, name).locator('.ats-page-header');

function geometry(root: Locator) {
  return root.evaluate((el) => {
    const r = (n: Element | null) => {
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width };
    };
    const title = el.querySelector('.ats-page-header__title')!;
    const ts = getComputedStyle(title);
    return {
      header: r(el)!,
      title: r(title)!,
      action: r(el.querySelector('.ats-page-header__actions button')),
      titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(ts.lineHeight)),
      titleClipped:
        title.scrollWidth > title.clientWidth || title.scrollHeight > title.clientHeight,
      titleNoWrap: ts.whiteSpace === 'nowrap' || ts.textOverflow === 'ellipsis',
      h1Count: el.querySelectorAll('h1').length,
    };
  });
}

const overlaps = (
  a: { top: number; bottom: number; left: number; right: number },
  b: { top: number; bottom: number; left: number; right: number },
) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test.describe('page header QA (#114)', () => {
  for (const width of [768, 1024, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test('the long title wraps, is never clipped and never overlaps the action', async ({
        page,
      }) => {
        await page.goto('/dev/ui');
        for (const panel of ['light', 'dark'] as const) {
          for (const name of ['list', 'long-title', 'breadcrumb', 'empty'] as const) {
            const g = await geometry(header(page, panel, name));
            const label = `${panel}/${name} at ${width}`;
            expect(g.h1Count, label).toBe(1);
            expect(g.titleClipped, label).toBe(false);
            expect(g.titleNoWrap, label).toBe(false);
            expect(overlaps(g.title, g.action!), label).toBe(false);
            expect(g.action!.left, label).toBeGreaterThanOrEqual(g.title.right);
          }
        }
        const long = await geometry(header(page, 'light', 'long-title'));
        expect(long.titleLines).toBeGreaterThan(1);
      });
    });
  }

  test.describe('at 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the long title wraps and the full-width action sits under it', async ({ page }) => {
      await page.goto('/dev/ui');
      const root = header(page, 'light', 'long-title');
      await root.scrollIntoViewIfNeeded();
      const g = await geometry(root);

      expect(g.titleLines).toBeGreaterThan(2);
      expect(g.titleClipped).toBe(false);
      expect(overlaps(g.title, g.action!)).toBe(false);
      expect(g.action!.top).toBeGreaterThanOrEqual(g.title.bottom);
      expect(g.action!.width).toBeCloseTo(g.header.width - 40, 0);
    });

    // Example · Mobile navigation closed: "Vị trí tuyển dụng" is about 155 px wide at 390 px, against
    // about 213 px in Example · Desktop list (24 px), which is the 18 px section-title size
    // (--font-size-lg / --line-height-lg), not the 24 px desktop page title.
    test('the title takes the smaller mobile size from the design', async ({ page }) => {
      await page.goto('/dev/ui');
      const title = header(page, 'light', 'list').getByRole('heading', { level: 1 });
      await title.scrollIntoViewIfNeeded();
      const style = await title.evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, lineHeight: s.lineHeight };
      });
      expect(style).toEqual({ size: '18px', lineHeight: '24px' });
    });

    // Example · Mobile navigation closed: the full-width "Tạo vị trí" ends about 20 px above the first
    // list item. On mobile the header drops its bottom inset and line, so a flush body (a table with
    // its own row padding) must still leave that space instead of starting right under the button.
    test('the flush list example leaves space between the full-width action and the table', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      for (const panel of ['light', 'dark'] as const) {
        const node = example(page, panel, 'list');
        await node.scrollIntoViewIfNeeded();
        const gap = await node.evaluate((el) => {
          const button = el.querySelector('.ats-page-header__actions button')!;
          const content = el.querySelector('.ats-page-body')!.firstElementChild!;
          return content.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
        });
        expect(gap, `${panel}: px between the action and the table`).toBeGreaterThanOrEqual(16);
      }
    });

    test('screenshots of the list and empty examples, light and dark', async ({ page }) => {
      await page.goto('/dev/ui');
      for (const panel of ['light', 'dark'] as const) {
        for (const name of ['list', 'empty'] as const) {
          const node = example(page, panel, name);
          await node.scrollIntoViewIfNeeded();
          await node.screenshot({
            path: test.info().outputPath(`qa-114-390-${panel}-${name}.png`),
          });
        }
      }
    });
  });

  test.describe('at 1440 px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the empty and breadcrumb examples keep the action on the right in the dark panel', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      for (const name of ['empty', 'breadcrumb'] as const) {
        const g = await geometry(header(page, 'dark', name));
        expect(g.header.right - g.action!.right, name).toBeCloseTo(40, 0);
        expect(g.action!.top, name).toBeLessThan(g.title.bottom);
        expect(g.action!.bottom, name).toBeGreaterThan(g.title.top);
      }
      const empty = example(page, 'dark', 'empty');
      await expect(empty.getByRole('heading', { name: 'Chưa có vị trí tuyển dụng' })).toBeVisible();
    });

    test('the 360 px gallery panel keeps the title readable beside the action', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      const panel = demo(page).locator('[data-panel]').nth(2);
      const root = panel.locator('[data-example="long-title"] .ats-page-header');
      const g = await geometry(root);
      expect(g.titleClipped).toBe(false);
      expect(overlaps(g.title, g.action!)).toBe(false);
    });

    // In the 360 px panel the viewport is still 1440 px, so the header keeps the desktop row and
    // the action (flex: none) leaves the title so little room that overflow-wrap: anywhere breaks
    // "Product Designer" inside its words ("Pro / duct / t / Desi / gner").
    test('the 360 px gallery panel never breaks a two-word title inside a word', async ({
      page,
    }) => {
      await page.goto('/dev/ui');
      const panel = demo(page).locator('[data-panel]').nth(2);
      const g = await geometry(panel.locator('[data-example="breadcrumb"] .ats-page-header'));
      expect(
        g.titleLines,
        '"Product Designer" takes at most one line per word',
      ).toBeLessThanOrEqual(2);
    });

    // ATS/Page wrapper and Example · Desktop list: the flush table's column text ("VỊ TRÍ", "Product
    // Designer") starts on the same 40 px line as the page title, so the header and the list line up.
    test('the flush list example lines the table text up with the page title', async ({ page }) => {
      await page.goto('/dev/ui');
      for (const panel of ['light', 'dark'] as const) {
        const node = example(page, panel, 'list');
        const lefts = await node.evaluate((el) => {
          const textLeft = (sel: string) => {
            const cell = el.querySelector(sel)!;
            const range = document.createRange();
            range.selectNodeContents(cell);
            return range.getBoundingClientRect().left;
          };
          return {
            title: textLeft('.ats-page-header__title'),
            columnHeader: textLeft('thead th'),
            firstCell: textLeft('tbody tr td'),
          };
        });
        expect(Math.abs(lefts.columnHeader - lefts.title), `${panel}: column header`).toBeLessThan(
          2,
        );
        expect(Math.abs(lefts.firstCell - lefts.title), `${panel}: first cell`).toBeLessThan(2);
      }
    });

    test('screenshots of every example, light and dark', async ({ page }) => {
      await page.goto('/dev/ui');
      for (const panel of ['light', 'dark'] as const) {
        for (const name of ['list', 'empty', 'breadcrumb', 'long-title'] as const) {
          const node = example(page, panel, name);
          await node.scrollIntoViewIfNeeded();
          await node.screenshot({
            path: test.info().outputPath(`qa-114-1440-${panel}-${name}.png`),
          });
        }
      }
      await demo(page)
        .locator('[data-panel]')
        .nth(2)
        .screenshot({ path: test.info().outputPath('qa-114-1440-panel360.png') });
    });
  });
});
