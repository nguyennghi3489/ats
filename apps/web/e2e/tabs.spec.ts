// Issue #55: AtsTabs / AtsTab, checked in the /dev/ui gallery against the design page "01 · Foundations"
// > "QA · Tab states" and the Light / Dark / Mobile tab specimens.
// One-line height 38 desktop / 46 mobile (minimums 36 / 44), insets 12 horizontal and 8 / 12 vertical,
// label -> 4 px gap -> 2 px indicator in normal flow with the indicator space reserved in every state,
// bold selected label, 3 px focus ring outside, disabled + selected keeps the indicator at disabled
// opacity, labels wrap at 360 px. The component holds no copy (labels come from the caller) and the
// gallery is developer tooling without i18n, so there is no vi/en variant; demo labels are Vietnamese
// as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    ink: 'rgb(41, 40, 34)',
    muted: 'rgb(102, 100, 93)',
    actionLine: 'rgb(121, 135, 82)',
    focusRing: 'rgb(41, 40, 34)',
  },
  dark: {
    ink: 'rgb(244, 241, 232)',
    muted: 'rgb(192, 190, 181)',
    actionLine: 'rgb(121, 135, 82)',
    focusRing: 'rgb(244, 241, 232)',
  },
} as const;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const STATES = [
  'default-unselected',
  'default-selected',
  'hover-unselected',
  'focus-unselected',
  'focus-selected',
  'disabled-unselected',
  'disabled-selected',
] as const;

const demo = (page: Page) => page.getByTestId('ui-demo-AtsTabs');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);

function tabStyle(tab: Locator) {
  return tab.evaluate((el) => {
    const s = getComputedStyle(el);
    const label = el.querySelector('.ats-tab__label')!;
    const indicator = el.querySelector('.ats-tab__indicator')!;
    const r = el.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const i = indicator.getBoundingClientRect();
    return {
      height: r.height,
      paddingTop: s.paddingTop,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      paddingRight: s.paddingRight,
      color: s.color,
      fontWeight: s.fontWeight,
      opacity: s.opacity,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset,
      labelHeight: l.height,
      labelToIndicator: i.top - l.bottom,
      indicatorHeight: i.height,
      indicatorBottomInset: r.bottom - i.bottom,
      indicatorColor: getComputedStyle(indicator).backgroundColor,
      indicatorPosition: getComputedStyle(indicator).position,
    };
  });
}

test.describe('Tab (AtsTabs / AtsTab)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('the gallery shows every tab state in light and dark with the "QA · Tab states" geometry', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsTabs' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      const t = TOKENS[id];
      for (const state of STATES) {
        await expect(p.getByTestId(`tab-${state}`), `${id}: ${state}`).toBeVisible();
        await expect(p.getByTestId(`tab-${state}`)).toHaveText('Ứng tuyển');
      }

      // Default · Unselected: muted regular label, transparent but reserved 2 px indicator, 38 px.
      const du = await tabStyle(p.getByTestId('tab-default-unselected'));
      expect(du.height, `${id}: one-line desktop height`).toBe(38);
      expect([du.paddingTop, du.paddingBottom], `${id}: vertical inset`).toEqual(['8px', '8px']);
      expect([du.paddingLeft, du.paddingRight], `${id}: horizontal inset`).toEqual([
        '12px',
        '12px',
      ]);
      expect(du.color).toBe(t.muted);
      expect(Number(du.fontWeight)).toBeLessThan(600);
      expect(du.labelToIndicator, `${id}: label -> indicator gap`).toBe(4);
      expect(du.indicatorHeight, `${id}: reserved indicator`).toBe(2);
      expect(du.indicatorColor).toBe(TRANSPARENT);
      expect(du.indicatorPosition, `${id}: indicator in normal flow`).toBe('static');
      await expect(p.getByTestId('tab-default-unselected')).toHaveAttribute(
        'aria-selected',
        'false',
      );

      // Default · Selected: bold ink label, action-line 2 px indicator, same height.
      const ds = await tabStyle(p.getByTestId('tab-default-selected'));
      expect(ds.height).toBe(38);
      expect(ds.color).toBe(t.ink);
      expect(Number(ds.fontWeight)).toBeGreaterThanOrEqual(700);
      expect(ds.indicatorHeight).toBe(2);
      expect(ds.labelToIndicator).toBe(4);
      expect(ds.indicatorColor).toBe(t.actionLine);
      await expect(p.getByTestId('tab-default-selected')).toHaveAttribute('aria-selected', 'true');

      // Hover · Unselected: ink label, still no indicator.
      const hu = await tabStyle(p.getByTestId('tab-hover-unselected'));
      expect(hu.color).toBe(t.ink);
      expect(hu.indicatorColor).toBe(TRANSPARENT);
      expect(hu.height).toBe(38);

      // Focus: 3 px ring outside the tab, size unchanged.
      for (const state of ['focus-unselected', 'focus-selected'] as const) {
        const f = await tabStyle(p.getByTestId(`tab-${state}`));
        expect(f.outlineStyle, `${id}: ${state}`).toBe('solid');
        expect(f.outlineWidth).toBe('3px');
        expect(f.outlineColor).toBe(t.focusRing);
        expect(parseFloat(f.outlineOffset)).toBeGreaterThanOrEqual(0);
        expect(f.height).toBe(38);
      }
      expect((await tabStyle(p.getByTestId('tab-focus-selected'))).indicatorColor).toBe(
        t.actionLine,
      );

      // Disabled · Selected keeps the indicator, at disabled opacity.
      const dis = await tabStyle(p.getByTestId('tab-disabled-selected'));
      expect(dis.opacity).toBe('0.45');
      expect(dis.indicatorColor).toBe(t.actionLine);
      expect(dis.height).toBe(38);
      await expect(p.getByTestId('tab-disabled-selected')).toHaveAttribute('aria-disabled', 'true');

      // 1 / 2 / 3 line labels: 16 px lines inside the 72 px label box.
      for (const [value, lines] of [
        ['one', 1],
        ['two', 2],
        ['three', 3],
      ] as const) {
        const s = await tabStyle(p.getByTestId(`tab-lines-${value}`));
        expect(s.labelHeight, `${id}: ${value} label lines`).toBe(16 * lines);
        expect(s.height).toBe(8 + 16 * lines + 4 + 2 + 8);
      }
      await expect(p.getByTestId('tab-lines-three')).toHaveText('Ứng tuyển cần xem xét');
    }

    await demo(page).screenshot({ path: test.info().outputPath('tabs-gallery-desktop.png') });
  });

  test('mouse and arrow keys update the selection, Home/End jump, disabled tabs are skipped', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const row = panel(page, 'light').getByTestId('tabs-job');
    await expect(row).toHaveAttribute('role', 'tablist');
    await expect(row).toHaveAttribute('aria-label', 'Job tabs');
    const tab = (name: string) => row.getByRole('tab', { name, exact: true });

    const expectSelected = async (name: string) => {
      await expect(tab(name)).toHaveAttribute('aria-selected', 'true');
      await expect(tab(name)).toBeFocused();
      await expect(row.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
      // Roving tabindex: only the selected tab is in the Tab order.
      expect(
        await row
          .getByRole('tab')
          .evaluateAll((els) => els.map((el) => el.getAttribute('tabindex'))),
      ).toEqual(
        [
          'Ứng tuyển',
          'Kế hoạch',
          'Nội dung',
          'Quy trình',
          'Nhóm & quyền truy cập',
          'Ứng tuyển cần xem xét',
        ].map((n) => (n === name ? '0' : '-1')),
      );
    };

    // Initial v-model is "content".
    await expect(tab('Nội dung')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Nội dung')).toHaveAttribute('tabindex', '0');

    await tab('Kế hoạch').click();
    await expectSelected('Kế hoạch');

    // A click on the disabled tab changes nothing.
    await tab('Quy trình').click({ force: true });
    await expect(tab('Quy trình')).toHaveAttribute('aria-selected', 'false');
    await expect(tab('Kế hoạch')).toHaveAttribute('aria-selected', 'true');

    await tab('Kế hoạch').focus();
    await page.keyboard.press('ArrowRight');
    await expectSelected('Nội dung');
    await page.keyboard.press('ArrowRight'); // skips the disabled "Quy trình"
    await expectSelected('Nhóm & quyền truy cập');
    await page.keyboard.press('ArrowLeft'); // skips it the other way
    await expectSelected('Nội dung');
    await page.keyboard.press('End');
    await expectSelected('Ứng tuyển cần xem xét');
    await page.keyboard.press('ArrowRight'); // wraps
    await expectSelected('Ứng tuyển');
    await page.keyboard.press('ArrowLeft'); // wraps back
    await expectSelected('Ứng tuyển cần xem xét');
    await page.keyboard.press('Home');
    await expectSelected('Ứng tuyển');

    // Tab from outside lands on the selected tab only, then leaves the row.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tab('Ứng tuyển')).toBeFocused();
  });

  test('switching selection never changes the row or tab height', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/dev/ui');
      const row = panel(page, 'light').getByTestId('tabs-job');
      const tabs = row.getByRole('tab');
      const measure = () =>
        row.evaluate((el) => ({
          row: el.getBoundingClientRect().height,
          tabs: [...el.querySelectorAll('[role="tab"]')].map(
            (t) => t.getBoundingClientRect().height,
          ),
        }));
      const before = await measure();
      for (const name of [
        'Ứng tuyển',
        'Kế hoạch',
        'Nhóm & quyền truy cập',
        'Ứng tuyển cần xem xét',
      ]) {
        await row.getByRole('tab', { name, exact: true }).click();
        expect(await measure(), `${viewport.width}px after selecting ${name}`).toEqual(before);
      }
      expect(await tabs.count()).toBe(6);

      // The one-tab state rows: selected and unselected are the same height.
      const p = panel(page, 'light');
      const heights = await Promise.all(
        STATES.map((s) =>
          p.getByTestId(`tab-${s}`).evaluate((el) => el.getBoundingClientRect().height),
        ),
      );
      expect(new Set(heights).size, `${viewport.width}px: state heights ${heights}`).toBe(1);
    }
  });

  test('at 360 px every tab is at least 44 px high and long labels wrap', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      const heights = await p
        .getByRole('tab')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(heights.length, `${id}: tab count`).toBeGreaterThan(0);
      for (const h of heights) expect(h, `${id}: tab height`).toBeGreaterThanOrEqual(44);

      const one = await tabStyle(p.getByTestId('tab-default-selected'));
      expect(one.height, `${id}: one-line mobile height`).toBe(46);
      expect([one.paddingTop, one.paddingBottom]).toEqual(['12px', '12px']);
      expect([one.paddingLeft, one.paddingRight]).toEqual(['12px', '12px']);

      const long = p.getByTestId('tabs-job').getByRole('tab', { name: 'Ứng tuyển cần xem xét' });
      const s = await tabStyle(long);
      expect(s.labelHeight, `${id}: "Ứng tuyển cần xem xét" wraps`).toBeGreaterThanOrEqual(32);
      expect(s.labelHeight).toBe(48);

      // The row wraps instead of overflowing the panel.
      const overflow = await p
        .getByTestId('tabs-job')
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `${id}: horizontal overflow`).toBeLessThanOrEqual(0);
    }

    await panel(page, 'mobile').screenshot({
      path: test.info().outputPath('tabs-gallery-360.png'),
    });
  });
});
