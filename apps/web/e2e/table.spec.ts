// Issue #59: AtsTable and AtsTableCell, checked in the /dev/ui gallery against the design page
// "01 · Foundations" > "ATS/Table header cell", "ATS/Table cell", "ATS/Table row", the Light / Dark /
// Mobile 360 specimens and "QA · Table row spacing": header 44, rows at least 56 (88 below 768 px)
// and as tall as the tallest cell, cell inset 8/12, primary/secondary gap 4, top-aligned content,
// one bottom divider per row, a right-pointing chevron on clickable rows, and at 360 px only the
// columns not marked hideOnMobile, with wrapping text.
// The component holds no copy (the caller passes translated labels) and the gallery is developer
// tooling without i18n, so there is no vi/en variant; the demo labels are Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    canvas: 'rgb(247, 247, 242)',
    surface: 'rgb(255, 255, 255)',
    accent: 'rgb(231, 225, 251)',
    ink: 'rgb(41, 40, 34)',
    muted: 'rgb(102, 100, 93)',
    line: 'rgb(177, 175, 165)',
  },
  dark: {
    canvas: 'rgb(34, 35, 32)',
    surface: 'rgb(42, 43, 39)',
    accent: 'rgb(73, 66, 82)',
    ink: 'rgb(244, 241, 232)',
    muted: 'rgb(192, 190, 181)',
    line: 'rgb(118, 119, 108)',
  },
} as const;

const HEADERS = ['Hồ sơ', 'Liên hệ', 'Ứng tuyển'];
const LONG_NAME = 'Tên ứng viên rất dài để kiểm tra xuống dòng trong ô của bảng';
const ROW_IDS = ['c-1', 'c-2', 'c-3'];

const demo = (page: Page) => page.getByTestId('ui-demo-AtsTable');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const table = (p: Locator, state: 'clickable' | 'static') =>
  p.locator(`[data-state="${state}"] table`);

function geometry(t: Locator) {
  return t.evaluate((el) => {
    const px = (v: string) => parseFloat(v);
    const headRow = el.querySelector('thead tr')!;
    const headers = [...el.querySelectorAll('thead th')].map((th) => {
      const s = getComputedStyle(th);
      return {
        text: (th as HTMLElement).innerText.trim(),
        visible: (th as HTMLElement).offsetParent !== null && s.display !== 'none',
        transform: s.textTransform,
        color: s.color,
        background: s.backgroundColor,
        scope: th.getAttribute('scope'),
      };
    });
    const rows = [...el.querySelectorAll('tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].filter(
        (td) => getComputedStyle(td).display !== 'none',
      );
      const rowBox = tr.getBoundingClientRect();
      const contentHeights = cells.map((td) => {
        const range = document.createRange();
        range.selectNodeContents(td);
        const kids = [...td.children].map((k) => k.getBoundingClientRect().height);
        return Math.max(range.getBoundingClientRect().height, ...kids);
      });
      return {
        height: rowBox.height,
        tallestContent: Math.max(...contentHeights),
        cellCount: cells.length,
        cells: cells.map((td) => {
          const s = getComputedStyle(td);
          const r = td.getBoundingClientRect();
          // Element content (slotted cell, link, chevron); plain text cells have none to measure.
          const content = td.firstElementChild;
          const c = content?.getBoundingClientRect();
          return {
            padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
            verticalAlign: s.verticalAlign,
            borderBottom: [s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor],
            borderTop: px(s.borderTopWidth),
            background: s.backgroundColor,
            contentTopInset: c ? c.top - r.top : 8,
            overflowsCell: td.scrollWidth > td.clientWidth,
          };
        }),
      };
    });
    const primary = el.querySelector('.ats-table-cell__primary');
    const secondary = el.querySelector('.ats-table-cell__secondary');
    return {
      headHeight: headRow.getBoundingClientRect().height,
      headers,
      rows,
      gap:
        primary && secondary
          ? secondary.getBoundingClientRect().top - primary.getBoundingClientRect().bottom
          : null,
      secondaryColor: secondary ? getComputedStyle(secondary).color : null,
      primaryColor: primary ? getComputedStyle(primary).color : null,
      tableWidth: el.getBoundingClientRect().width,
      wrapperOverflow: el.parentElement!.scrollWidth - el.parentElement!.clientWidth,
    };
  });
}

test.describe('Table (AtsTable, AtsTableCell)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('desktop: light and dark panels match "QA · Table row spacing" geometry and tokens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsTable' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const tk = TOKENS[id];
      for (const state of ['clickable', 'static'] as const) {
        const t = table(panel(page, id), state);
        const g = geometry(t);
        const r = await g;
        const label = `${id}/${state}`;

        expect(r.headHeight, `${label}: header height`).toBe(44);
        expect(
          r.headers.map((h) => h.text.toLowerCase()),
          `${label}: header labels`,
        ).toEqual(HEADERS.map((h) => h.toLowerCase()));
        for (const h of r.headers) {
          expect(h.scope).toBe('col');
          expect(h.visible, `${label}: ${h.text} visible on desktop`).toBe(true);
          expect(h.transform, `${label}: uppercase header`).toBe('uppercase');
          expect(h.color, `${label}: muted header label`).toBe(tk.muted);
        }

        expect(r.rows).toHaveLength(3);
        for (const [i, row] of r.rows.entries()) {
          expect(row.height, `${label} row ${i}: at least 56 px`).toBeGreaterThanOrEqual(56);
          expect(row.cellCount, `${label} row ${i}: cells`).toBe(state === 'clickable' ? 4 : 3);
          for (const c of row.cells) {
            expect(c.padding, `${label}: inset 8/12`).toEqual(['8px', '12px', '8px', '12px']);
            expect(c.verticalAlign, `${label}: top aligned`).toBe('top');
            expect(c.borderBottom, `${label}: one bottom divider`).toEqual([
              '1px',
              'solid',
              tk.line,
            ]);
            expect(c.borderTop, `${label}: no top border`).toBe(0);
            // border-collapse puts half of the previous row's 1 px divider inside this cell's box.
            expect(
              c.contentTopInset,
              `${label}: content starts at the 8 px inset`,
            ).toBeGreaterThanOrEqual(8);
            expect(
              c.contentTopInset,
              `${label}: content starts at the 8 px inset`,
            ).toBeLessThanOrEqual(8.5);
            expect(c.overflowsCell, `${label}: nothing spills out of a cell`).toBe(false);
          }
        }
        // The row is as tall as its tallest cell (content + 8/8 inset + 1 px divider), never below 56.
        for (const [i, row] of r.rows.entries()) {
          const expected = Math.max(56, row.tallestContent + 16 + 1);
          expect(
            Math.abs(row.height - expected),
            `${label} row ${i}: follows the tallest cell`,
          ).toBeLessThanOrEqual(1);
        }

        expect(r.gap, `${label}: primary/secondary gap`).toBe(4);
        expect(r.primaryColor).toBe(tk.ink);
        expect(r.secondaryColor, `${label}: secondary is muted`).toBe(tk.muted);
      }

      // Clickable table: a right-pointing chevron per row; static table: none.
      const clickable = table(panel(page, id), 'clickable');
      const chevrons = clickable.locator('tbody .ats-table__chevron svg');
      await expect(chevrons).toHaveCount(3);
      const transform = await chevrons
        .first()
        .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform));
      // rotate(-90deg): matrix(0, -1, 1, 0, 0, 0)
      expect(Math.round(transform.b)).toBe(-1);
      expect(Math.round(transform.c)).toBe(1);
      await expect(table(panel(page, id), 'static').locator('svg')).toHaveCount(0);
      await expect(table(panel(page, id), 'static').locator('a')).toHaveCount(0);
    }

    await panel(page, 'light').screenshot({
      path: test.info().outputPath('table-light-desktop.png'),
    });
    await panel(page, 'dark').screenshot({
      path: test.info().outputPath('table-dark-desktop.png'),
    });
  });

  test('hover and focus-within on a clickable row use the accent token; static rows do not react', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const tk = TOKENS[id];
      const row = table(panel(page, id), 'clickable').locator('tbody tr').nth(1);
      const bg = () =>
        row
          .locator('td')
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor);

      await row.locator('td').nth(2).hover();
      expect(await bg(), `${id}: hover`).toBe(tk.accent);
      await page.mouse.move(0, 0);
      expect(await bg(), `${id}: rest`).not.toBe(tk.accent);

      await row.getByRole('link').focus();
      expect(await bg(), `${id}: focus-within`).toBe(tk.accent);
      await row.getByRole('link').blur();

      const staticRow = table(panel(page, id), 'static').locator('tbody tr').nth(1);
      await staticRow.locator('td').nth(2).hover();
      expect(
        await staticRow
          .locator('td')
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        `${id}: static row hover`,
      ).not.toBe(tk.accent);
      expect(await staticRow.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
    }
  });

  test('at a 360 px viewport hideOnMobile columns are hidden, rows are at least 88 px and the long name wraps', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      for (const state of ['clickable', 'static'] as const) {
        const t = table(panel(page, id), state);
        const r = await geometry(t);
        const label = `${id}/${state}`;

        expect(r.headHeight, `${label}: header height`).toBe(44);
        expect(
          r.headers.filter((h) => h.visible).map((h) => h.text.toLowerCase()),
          `${label}: visible headers`,
        ).toEqual(['hồ sơ', 'ứng tuyển']);
        await expect(t.getByText('minh.anh@example.com')).toBeHidden();

        for (const [i, row] of r.rows.entries()) {
          expect(row.height, `${label} row ${i}: at least 88 px`).toBeGreaterThanOrEqual(88);
          expect(row.cellCount).toBe(state === 'clickable' ? 3 : 2);
          for (const c of row.cells) {
            expect(c.verticalAlign).toBe('top');
            expect(c.overflowsCell, `${label}: text stays inside its cell`).toBe(false);
          }
        }
        expect(r.wrapperOverflow, `${label}: no horizontal scroll`).toBeLessThanOrEqual(0);

        // The long name wraps onto several lines inside its cell, all of it visible.
        const longName = t.locator('.ats-table-cell__primary', { hasText: LONG_NAME });
        await expect(longName).toHaveText(LONG_NAME);
        const wrap = await longName.evaluate((el) => {
          const s = getComputedStyle(el);
          const cell = el.closest('td')!.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          return {
            lines: Math.round(r.height / parseFloat(s.lineHeight)),
            insideCell: r.left >= cell.left && r.right <= cell.right,
            clipped: el.scrollWidth > el.clientWidth,
          };
        });
        expect(wrap.lines, `${label}: long name wraps`).toBeGreaterThanOrEqual(2);
        expect(wrap.insideCell, `${label}: long name stays inside its cell`).toBe(true);
        expect(wrap.clipped).toBe(false);
      }
    }

    await panel(page, 'mobile').screenshot({ path: test.info().outputPath('table-360.png') });
    await panel(page, 'light').screenshot({ path: test.info().outputPath('table-360-light.png') });
    await panel(page, 'dark').screenshot({ path: test.info().outputPath('table-360-dark.png') });
  });

  test('accessibility: column headers and caption are exposed to assistive tech', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const clickable = p.getByRole('table', { name: 'Hồ sơ ứng viên', exact: true });
    await expect(clickable).toBeVisible();
    await expect(clickable.getByRole('columnheader')).toHaveText(
      HEADERS.map((h) => new RegExp(h, 'i')),
    );
    await expect(p.getByRole('table', { name: 'Hồ sơ ứng viên (chỉ xem)' })).toBeVisible();

    // The caption is visually hidden.
    const box = await clickable.locator('caption').boundingBox();
    expect(box!.width).toBeLessThanOrEqual(1);
    expect(box!.height).toBeLessThanOrEqual(1);
  });

  test('with rowTo: clicking anywhere on a row and Enter on its link navigate; Tab stops once per row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const t = table(panel(page, 'light'), 'clickable');
    const rows = t.locator('tbody tr');
    const hash = () => page.evaluate(() => location.hash);

    // Click on a non-link cell and on the chevron.
    await rows.nth(1).locator('td').nth(2).click();
    await expect.poll(hash).toBe('#c-2');
    await page.evaluate(() => history.replaceState(history.state, '', location.pathname));
    await rows.nth(0).locator('.ats-table__chevron').click();
    await expect.poll(hash).toBe('#c-1');
    await page.evaluate(() => history.replaceState(history.state, '', location.pathname));
    // Click on the secondary text inside the link cell.
    await rows.nth(2).locator('td').first().locator('.ats-table-cell__secondary').click();
    await expect.poll(hash).toBe('#c-3');

    // Tab visits exactly one element per row: the row's link, in order.
    await rows.nth(0).getByRole('link').focus();
    const visited: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) await page.keyboard.press('Tab');
      visited.push(
        await page.evaluate(() => {
          const a = document.activeElement as HTMLAnchorElement;
          return `${a.tagName}:${a.closest('tbody tr') ? a.getAttribute('href') : 'outside'}`;
        }),
      );
    }
    expect(visited.map((v) => v.replace(/^A:.*#/, '#'))).toEqual(ROW_IDS.map((r) => `#${r}`));
    await page.keyboard.press('Tab');
    const after = await t.evaluate((table) => table.contains(document.activeElement));
    expect(after, 'the 4th Tab leaves the clickable table').toBe(false);

    // Enter on a focused link navigates.
    await page.evaluate(() => history.replaceState(history.state, '', location.pathname));
    await rows.nth(1).getByRole('link').focus();
    await page.keyboard.press('Enter');
    await expect.poll(hash).toBe('#c-2');
  });

  test('without rowTo: rows have no chevron, no link and clicking does nothing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    for (const id of ['light', 'dark', 'mobile'] as const) {
      const t = table(panel(page, id), 'static');
      await expect(t.getByRole('link')).toHaveCount(0);
      await expect(t.locator('.ats-table__chevron, svg')).toHaveCount(0);
      await expect(t.locator('thead tr > *')).toHaveCount(3);
    }
    const before = page.url();
    await table(panel(page, 'light'), 'static').locator('tbody tr').nth(1).click();
    expect(page.url()).toBe(before);
  });

  test('on a wide screen the two-line rows of short content sit at the 56 px minimum', async ({
    page,
  }) => {
    // Wide enough that each gallery panel is close to the 944 px design specimen.
    await page.setViewportSize({ width: 3000, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    for (const id of ['light', 'dark'] as const) {
      const r = await geometry(table(panel(page, id), 'clickable'));
      expect(r.tableWidth, `${id}: table width`).toBeGreaterThan(800);
      expect(r.headHeight).toBe(44);
      // Two short rows: primary 20 + gap 4 + secondary 16 + inset 16 = 56 (+ the collapsed divider).
      for (const i of [0, 1]) {
        expect(r.rows[i]!.height, `${id} row ${i}`).toBeGreaterThanOrEqual(56);
        expect(r.rows[i]!.height, `${id} row ${i}`).toBeLessThanOrEqual(57);
      }
    }
    await panel(page, 'light').screenshot({ path: test.info().outputPath('table-light-wide.png') });
    await panel(page, 'dark').screenshot({ path: test.info().outputPath('table-dark-wide.png') });
  });
});
