// Issue #57: AtsBadge, checked in the /dev/ui gallery against the design page "01 · Foundations"
// > "ATS/Badge", the Light / Dark / Mobile 360 specimens and "QA · Badge spacing".
// Height 28, inset 4/12, 4 px icon gap, pill radius, a 1 px border on every tone; generic tones only.
// The component holds no copy (the caller passes translated text) and the gallery is developer tooling
// without i18n, so there is no vi/en variant; demo labels are Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    neutral: { border: 'rgb(177, 175, 165)', fill: 'rgb(255, 255, 255)', text: 'rgb(41, 40, 34)' },
    accent: { border: 'rgb(231, 225, 251)', fill: 'rgb(231, 225, 251)', text: 'rgb(41, 40, 34)' },
    success: { border: 'rgb(121, 135, 82)', fill: 'rgb(228, 240, 211)', text: 'rgb(41, 40, 34)' },
    danger: { border: 'rgb(164, 41, 41)', fill: 'rgb(248, 226, 223)', text: 'rgb(164, 41, 41)' },
  },
  dark: {
    neutral: { border: 'rgb(118, 119, 108)', fill: 'rgb(42, 43, 39)', text: 'rgb(244, 241, 232)' },
    accent: { border: 'rgb(73, 66, 82)', fill: 'rgb(73, 66, 82)', text: 'rgb(244, 241, 232)' },
    success: { border: 'rgb(202, 221, 150)', fill: 'rgb(42, 43, 39)', text: 'rgb(244, 241, 232)' },
    danger: { border: 'rgb(255, 181, 172)', fill: 'rgb(42, 43, 39)', text: 'rgb(255, 181, 172)' },
  },
} as const;

// The specimen labels, in the order of the design.
const TONES = [
  ['neutral', 'Nhãn'],
  ['accent', 'Nổi bật'],
  ['success', 'Đã xác minh'],
  ['danger', 'Không thể lưu'],
] as const;

const LONG_TEXT = 'Đã xác minh bởi người phụ trách tuyển dụng';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsBadge');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const tonesRow = (p: Locator) => p.locator('[data-state="tones"] .ats-badge');

function badgeStyle(badge: Locator) {
  return badge.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const icon = el.querySelector('.ats-badge__icon');
    const text = el.querySelector('.ats-badge__text')!;
    const t = getComputedStyle(text);
    const tr = text.getBoundingClientRect();
    const ir = icon?.getBoundingClientRect();
    return {
      tag: el.tagName,
      height: r.height,
      width: r.width,
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      borderWidth: s.borderTopWidth,
      borderStyle: s.borderTopStyle,
      borderColor: s.borderTopColor,
      radius: parseFloat(s.borderTopLeftRadius),
      fill: s.backgroundColor,
      color: s.color,
      whiteSpace: t.whiteSpace,
      textOverflow: t.textOverflow,
      textClipped: text.scrollWidth > text.clientWidth,
      textHeight: tr.height,
      iconSize: ir ? [ir.width, ir.height] : null,
      iconGap: ir ? tr.left - ir.right : null,
      title: el.getAttribute('title'),
      role: el.getAttribute('role'),
      tabIndex: (el as HTMLElement).tabIndex,
    };
  });
}

test.describe('Badge (AtsBadge)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('the gallery shows the four tones in light and dark with the "QA · Badge spacing" geometry and colours', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsBadge' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      const badges = tonesRow(p);
      await expect(badges, `${id}: tone labels`).toHaveText(TONES.map(([, label]) => label));

      const borders = new Set<string>();
      for (const [i, [tone]] of TONES.entries()) {
        const s = await badgeStyle(badges.nth(i));
        const t = TOKENS[id][tone];
        expect(s.tag, `${id} ${tone}: element`).toBe('SPAN');
        expect(s.height, `${id} ${tone}: height`).toBe(28);
        expect(s.padding, `${id} ${tone}: inset 4/12`).toEqual(['4px', '12px', '4px', '12px']);
        expect(s.radius, `${id} ${tone}: pill radius`).toBeGreaterThanOrEqual(14);
        expect([s.borderWidth, s.borderStyle], `${id} ${tone}: border`).toEqual(['1px', 'solid']);
        expect(s.borderColor, `${id} ${tone}: border colour`).toBe(t.border);
        expect(s.fill, `${id} ${tone}: fill`).toBe(t.fill);
        expect(s.color, `${id} ${tone}: text colour`).toBe(t.text);
        expect(s.whiteSpace).toBe('nowrap');
        expect(s.textClipped, `${id} ${tone}: short label is not truncated`).toBe(false);
        borders.add(s.borderColor);
      }
      // Each tone has its own text and its own border colour, so it does not rely on fill alone.
      expect(borders.size, `${id}: distinct border colours`).toBe(4);

      // Icon example: 16 px icon, 4 px before the text, the badge stays 28 px.
      const iconBadges = p.locator('[data-state="icon"] .ats-badge');
      await expect(iconBadges).toHaveText(['Đã xác minh', 'Không thể lưu']);
      for (let i = 0; i < 2; i++) {
        const s = await badgeStyle(iconBadges.nth(i));
        expect(s.height, `${id}: icon badge height`).toBe(28);
        expect(s.iconSize, `${id}: icon size`).toEqual([16, 16]);
        expect(s.iconGap, `${id}: icon -> text gap`).toBe(4);
      }
    }

    await demo(page).screenshot({ path: test.info().outputPath('badge-gallery-desktop.png') });
  });

  test('at 360 px each badge is 28 px high and the row fits the panel', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      const badges = p.locator('.ats-badge');
      const heights = await badges.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().height),
      );
      expect(heights.length, `${id}: badge count`).toBe(7);
      for (const h of heights) expect(h, `${id}: badge height`).toBe(28);
      await expect(tonesRow(p)).toHaveText(TONES.map(([, label]) => label));

      const overflow = await p
        .locator('[data-state="tones"]')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `${id}: horizontal overflow`).toBeLessThanOrEqual(0);
    }

    await panel(page, 'mobile').screenshot({
      path: test.info().outputPath('badge-gallery-360.png'),
    });
  });

  test('a long badge in a 120 px container truncates with an ellipsis and keeps the full text in title', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const container = panel(page, id).locator('[data-state="long"] .badge-demo__narrow');
      const box = await container.boundingBox();
      expect(box?.width, `${id}: container width`).toBe(120);

      const badge = container.locator('.ats-badge');
      const s = await badgeStyle(badge);
      expect(s.width, `${id}: badge fits the container`).toBeLessThanOrEqual(120);
      expect(s.height, `${id}: still one line, 28 px`).toBe(28);
      expect(s.textClipped, `${id}: text is clipped`).toBe(true);
      expect(s.textOverflow).toBe('ellipsis');
      expect(s.whiteSpace).toBe('nowrap');
      expect(s.title, `${id}: title holds the full text`).toBe(LONG_TEXT);
      await expect(badge).toHaveText(LONG_TEXT);
    }

    await panel(page, 'light')
      .locator('[data-state="long"]')
      .screenshot({ path: test.info().outputPath('badge-long-120.png') });
  });

  test('badges are not reachable with Tab', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    const all = demo(page).locator('.ats-badge');
    expect(await all.count()).toBe(21);
    for (const s of await Promise.all((await all.all()).map((b) => badgeStyle(b)))) {
      expect(s.tabIndex).toBe(-1);
      expect(s.role).toBeNull();
    }

    // The badge demo is the first demo in the gallery: tab from the top of the page until focus
    // reaches the next demo; nothing inside the badge demo may take focus on the way.
    const where = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return 'body';
        if (a.closest('[data-testid="ui-demo-AtsBadge"]')) return 'badge';
        const d = a.closest('[data-testid^="ui-demo-"]');
        return d ? d.getAttribute('data-testid') : 'outside';
      });
    const visited: (string | null)[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const w = await where();
      visited.push(w);
      if (w && w.startsWith('ui-demo-')) break;
    }
    expect(visited, 'focus never lands in the badge demo').not.toContain('badge');
    expect(visited.at(-1), 'focus reached the next demo').toBe('ui-demo-AtsButton');
  });
});
