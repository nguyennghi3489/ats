// Issue #47: AtsNavItem, checked in the /dev/ui gallery against the design page "01 · Foundations" >
// "QA · Navigation states": desktop min 40 px, mobile min 44 px, 12 px inset, 10 px icon/text gap,
// mobile labels wrap with 8 px top/bottom padding, and selection stays visible with focus and disabled.
// The component holds no copy (labels come from the caller) and the gallery is developer tooling
// without i18n, so there is no vi/en variant to compare here; the demo copy is Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    sidebar: 'rgb(238, 233, 251)',
    accent: 'rgb(231, 225, 251)',
    ink: 'rgb(41, 40, 34)',
    focusRing: 'rgb(41, 40, 34)',
  },
  dark: {
    sidebar: 'rgb(46, 44, 50)',
    accent: 'rgb(73, 66, 82)',
    ink: 'rgb(244, 241, 232)',
    focusRing: 'rgb(244, 241, 232)',
  },
} as const;

const STATES = [
  'default',
  'hover',
  'focus',
  'selected',
  'focus-selected',
  'disabled',
  'disabled-selected',
  'long',
  'long-focus-selected',
  'long-disabled-selected',
] as const;
type State = (typeof STATES)[number];

const LABEL = 'Ứng tuyển';
const LONG_LABEL = 'Ứng tuyển được phân công cần xem xét hôm nay';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsNavItem');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const item = (scope: Locator, name: State) =>
  scope.locator(`section[data-state="${name}"] .ats-nav-item`);

function measure(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const icon = el.querySelector('.ats-nav-item__icon')!.getBoundingClientRect();
    const label = el.querySelector('.ats-nav-item__label')!;
    const l = label.getBoundingClientRect();
    return {
      tag: el.tagName,
      height: r.height,
      background: s.backgroundColor,
      color: s.color,
      fontWeight: s.fontWeight,
      opacity: s.opacity,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      paddingLeft: parseFloat(s.paddingLeft),
      paddingTop: parseFloat(s.paddingTop),
      paddingBottom: parseFloat(s.paddingBottom),
      insetLeft: icon.left - r.left,
      iconWidth: icon.width,
      iconHeight: icon.height,
      gap: l.left - icon.right,
      iconTop: icon.top,
      iconBottom: icon.bottom,
      labelTop: l.top,
      labelBottom: l.bottom,
      labelHeight: l.height,
      labelLineHeight: parseFloat(getComputedStyle(label).lineHeight),
      itemTop: r.top,
      itemBottom: r.bottom,
    };
  });
}

test.describe('Navigation item (AtsNavItem)', () => {
  test('the gallery shows every state in light, dark and 360 px panels matching "QA · Navigation states"', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsNavItem' })).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      expect(
        await p
          .locator('section[data-state]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))),
      ).toEqual([...STATES]);
      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;

      // Default · Unselected: sidebar surface, regular weight, no ring, 40 px, inset 12, gap 10, 16 px icon.
      const def = await measure(item(p, 'default'));
      expect(def.tag, `${id}: default is a link`).toBe('A');
      expect(def.background, `${id}: default surface`).toBe(t.sidebar);
      expect(def.color, `${id}: default ink`).toBe(t.ink);
      expect(def.fontWeight).toBe('400');
      expect(def.outlineStyle).toBe('none');
      expect(def.opacity).toBe('1');
      expect(def.height, `${id}: desktop height`).toBe(40);
      expect(def.paddingLeft, `${id}: inset`).toBe(12);
      expect(def.insetLeft, `${id}: icon inset`).toBe(12);
      expect(def.gap, `${id}: icon/text gap`).toBeCloseTo(10, 0);
      expect([def.iconWidth, def.iconHeight], `${id}: icon size`).toEqual([16, 16]);
      await expect(item(p, 'default')).toHaveText(LABEL);
      await expect(item(p, 'default')).not.toHaveAttribute('aria-current', /.*/);
      await expect(item(p, 'default')).toHaveAttribute('href', '/');

      // Hover (demo-pinned): accent surface, still regular weight.
      const hov = await measure(item(p, 'hover'));
      expect(hov.background, `${id}: hover surface`).toBe(t.accent);
      expect(hov.fontWeight).toBe('400');

      // Focus · Unselected: 3 px focus ring on the unselected surface.
      const foc = await measure(item(p, 'focus'));
      expect(foc.background).toBe(t.sidebar);
      expect(foc.outlineStyle).toBe('solid');
      expect(foc.outlineWidth).toBe('3px');
      expect(foc.outlineColor, `${id}: focus ring colour`).toBe(t.focusRing);

      // Default · Selected: accent surface, bold label, aria-current.
      const sel = await measure(item(p, 'selected'));
      expect(sel.background, `${id}: selected surface`).toBe(t.accent);
      expect(sel.fontWeight).toBe('700');
      expect(sel.outlineStyle).toBe('none');
      await expect(item(p, 'selected')).toHaveAttribute('aria-current', 'page');

      // Focus · Selected keeps the selected look and adds the ring.
      const fs = await measure(item(p, 'focus-selected'));
      expect(fs.background).toBe(t.accent);
      expect(fs.fontWeight).toBe('700');
      expect(fs.outlineStyle).toBe('solid');
      expect(fs.outlineColor).toBe(t.focusRing);
      await expect(item(p, 'focus-selected')).toHaveAttribute('aria-current', 'page');

      // Disabled · Unselected: non-link, disabled opacity, unselected surface.
      const dis = await measure(item(p, 'disabled'));
      expect(dis.tag, `${id}: disabled is not a link`).toBe('SPAN');
      expect(dis.opacity).toBe('0.45');
      expect(dis.background).toBe(t.sidebar);
      expect(dis.fontWeight).toBe('400');
      await expect(item(p, 'disabled')).toHaveAttribute('aria-disabled', 'true');
      await expect(item(p, 'disabled')).not.toHaveAttribute('href', /.*/);

      // Disabled · Selected keeps the selected surface and weight under the disabled opacity.
      const ds = await measure(item(p, 'disabled-selected'));
      expect(ds.tag).toBe('SPAN');
      expect(ds.opacity).toBe('0.45');
      expect(ds.background).toBe(t.accent);
      expect(ds.fontWeight).toBe('700');
      await expect(item(p, 'disabled-selected')).toHaveAttribute('aria-disabled', 'true');
      await expect(item(p, 'disabled-selected')).toHaveAttribute('aria-current', 'page');

      // Long labels show in full.
      await expect(item(p, 'long')).toHaveText(LONG_LABEL);
    }

    await page.screenshot({ path: test.info().outputPath('nav-item-light.png'), fullPage: true });
    await demo(page).screenshot({ path: test.info().outputPath('nav-item-demo-desktop.png') });

    // The 360 px panel follows the app theme: dark scheme gives dark tokens there too.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(demo(page)).toBeVisible();
    const mob = await measure(item(panel(page, 'mobile'), 'selected'));
    expect(mob.background).toBe(TOKENS.dark.accent);
    await demo(page).screenshot({ path: test.info().outputPath('nav-item-demo-dark-scheme.png') });
  });

  test('real hover takes the accent surface (not when disabled) and Tab skips disabled items with a visible ring', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    await item(p, 'default').hover();
    expect((await measure(item(p, 'default'))).background, 'hovered item').toBe(
      TOKENS.light.accent,
    );
    await item(p, 'disabled').hover();
    expect((await measure(item(p, 'disabled'))).background, 'hovered disabled item').toBe(
      TOKENS.light.sidebar,
    );

    // Keyboard order inside the light panel: every enabled item, no disabled one.
    await item(p, 'default').focus();
    const order: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      order.push(
        await page.evaluate(
          () =>
            document.activeElement?.closest('section[data-state]')?.getAttribute('data-state') ??
            '',
        ),
      );
      await page.keyboard.press('Tab');
    }
    expect(order).toEqual([
      'default',
      'hover',
      'focus',
      'selected',
      'focus-selected',
      'long',
      'long-focus-selected',
    ]);

    // The real :focus-visible ring (keyboard focus) on an unselected and a selected item.
    await item(p, 'default').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await measure(item(p, 'default'));
    expect(ring.outlineStyle).toBe('solid');
    expect(ring.outlineWidth).toBe('3px');
    expect(ring.outlineColor).toBe(TOKENS.light.focusRing);
    await page.keyboard.press('Tab'); // hover
    await page.keyboard.press('Tab'); // focus
    await page.keyboard.press('Tab'); // selected
    const selRing = await measure(item(p, 'selected'));
    expect(selRing.outlineStyle).toBe('solid');
    expect(selRing.background, 'selection kept under focus').toBe(TOKENS.light.accent);
    expect(selRing.fontWeight).toBe('700');
  });

  test('clicking an enabled item navigates; clicking a disabled one does not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    await item(p, 'disabled').click({ force: true });
    await expect(page).toHaveURL(/\/dev\/ui$/);

    await item(p, 'default').click();
    // The item links to `/`, which opens `/jobs` (#113) and sends a signed-out visitor on to
    // sign-in (#82).
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fjobs$/);
    await expect(page.getByTestId('ui-gallery')).toHaveCount(0);
  });

  test('at 360 px every item is at least 44 px and the long label wraps beside the icon with 8 px padding', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      for (const s of STATES) {
        const m = await measure(item(p, s));
        expect(m.height, `${id}/${s}: mobile min height`).toBeGreaterThanOrEqual(44);
        expect(m.paddingTop, `${id}/${s}: top padding`).toBe(8);
        expect(m.paddingBottom, `${id}/${s}: bottom padding`).toBe(8);
      }

      for (const s of ['long', 'long-focus-selected', 'long-disabled-selected'] as const) {
        const m = await measure(item(p, s));
        // Wraps onto at least two lines, never truncated, and the item grows with it.
        expect(m.labelHeight, `${id}/${s}: wraps`).toBeGreaterThanOrEqual(2 * m.labelLineHeight);
        expect(m.height, `${id}/${s}: grows`).toBeCloseTo(m.labelHeight + 16, 0);
        // Beside the icon: icon left of the label, vertically inside the label block.
        expect(m.gap, `${id}/${s}: gap`).toBeCloseTo(10, 0);
        expect(m.iconTop).toBeGreaterThanOrEqual(m.labelTop);
        expect(m.iconBottom).toBeLessThanOrEqual(m.labelBottom);
        await expect(item(p, s)).toHaveText(LONG_LABEL);
        const overflow = await item(p, s)
          .locator('.ats-nav-item__label')
          .evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(overflow, `${id}/${s}: no clipping`).toBe(false);
      }
    }

    // Every item stays inside its panel (the gallery's own fixed 360 px panel plus page padding may
    // scroll the page, which is gallery layout, not the component), and the light panel fits on screen.
    for (const id of ['light', 'dark', 'mobile'] as const) {
      const fits = await panel(page, id).evaluate((el) => {
        const pr = el.getBoundingClientRect();
        return [...el.querySelectorAll('.ats-nav-item')].every((n) => {
          const r = n.getBoundingClientRect();
          return r.left >= pr.left && r.right <= pr.right;
        });
      });
      expect(fits, `${id}: items inside the panel`).toBe(true);
    }
    const light = await panel(page, 'light').boundingBox();
    expect(light!.x + light!.width).toBeLessThanOrEqual(360);

    await page.screenshot({ path: test.info().outputPath('nav-item-360.png'), fullPage: true });
  });
});
