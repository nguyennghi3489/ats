// Issue #61: AtsMenu and AtsMenuItem, checked in the /dev/ui gallery against the design page
// "01 · Foundations" > "ATS/Menu", "ATS/Menu item", the Light / Dark / Mobile 360 specimens and
// "QA · Menu item states": items 40 px on desktop and 44 px at 360 px, inset 8/12, icon/text gap 8,
// focus = highlighted fill plus a 3 px ring outside, disabled dimmed, danger label in the error colour,
// uppercase group heading "HỒ SƠ ỨNG VIÊN", and a panel that stays inside a 360 px viewport.
// The component holds no copy (the caller passes translated labels) and the gallery is developer
// tooling without i18n, so there is no vi/en variant; the demo labels are Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    surface: 'rgb(255, 255, 255)',
    accent: 'rgb(231, 225, 251)',
    ink: 'rgb(41, 40, 34)',
    muted: 'rgb(102, 100, 93)',
    line: 'rgb(177, 175, 165)',
    danger: 'rgb(164, 41, 41)',
    ring: 'rgb(41, 40, 34)',
  },
  dark: {
    surface: 'rgb(42, 43, 39)',
    accent: 'rgb(73, 66, 82)',
    ink: 'rgb(244, 241, 232)',
    muted: 'rgb(192, 190, 181)',
    line: 'rgb(118, 119, 108)',
    danger: 'rgb(255, 181, 172)',
    ring: 'rgb(244, 241, 232)',
  },
} as const;

const ITEMS = ['Mở hồ sơ', 'Chỉnh sửa hồ sơ', 'Không khả dụng', 'Lưu trữ hồ sơ'];
const SHOTS = 'test-results/menu';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsMenu');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const menu = (page: Page) => page.getByRole('menu', { name: 'Hồ sơ ứng viên' });

function itemStyle(item: Locator) {
  return item.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const icon = el.querySelector('svg');
    const label = el.querySelector('.ats-menu-item__label')!;
    const ir = icon?.getBoundingClientRect();
    const lr = label.getBoundingClientRect();
    return {
      role: el.getAttribute('role'),
      ariaDisabled: el.getAttribute('aria-disabled'),
      height: r.height,
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      iconGap: ir ? Math.round(lr.left - ir.right) : null,
      iconInset: ir ? Math.round(ir.left - r.left) : null,
      hasIcon: Boolean(icon),
      background: s.backgroundColor,
      color: s.color,
      labelColor: getComputedStyle(label).color,
      outline: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset],
      opacity: s.opacity,
      text: (el as HTMLElement).innerText.trim(),
    };
  });
}

test.describe('Menu (AtsMenu, AtsMenuItem)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('desktop: item states in light and dark match "QA · Menu item states"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsMenu' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const tk = TOKENS[id];
      const p = panel(page, id);
      for (const caption of ['Default', 'Focus', 'Disabled', 'Danger']) {
        await expect(p.getByText(caption, { exact: true })).toBeVisible();
      }
      const def = await itemStyle(p.getByTestId('menu-item-default'));
      const focus = await itemStyle(p.getByTestId('menu-item-focus'));
      const disabled = await itemStyle(p.getByTestId('menu-item-disabled'));
      const danger = await itemStyle(p.getByTestId('menu-item-danger'));

      expect([def.text, focus.text, disabled.text, danger.text]).toEqual(ITEMS);
      for (const [name, s] of Object.entries({ def, focus, disabled, danger })) {
        const label = `${id}/${name}`;
        expect(s.role, `${label}: role`).toBe('menuitem');
        expect(s.height, `${label}: 40 px on desktop`).toBe(40);
        expect(s.padding, `${label}: inset 8/12`).toEqual(['8px', '12px', '8px', '12px']);
        expect(s.hasIcon, `${label}: icon`).toBe(true);
        expect(s.iconInset, `${label}: icon 12 px from the start`).toBe(12);
        expect(s.iconGap, `${label}: icon/text gap 8`).toBe(8);
      }

      expect(def.background, `${id}: default has no fill`).toBe('rgba(0, 0, 0, 0)');
      expect(def.labelColor, `${id}: default ink`).toBe(tk.ink);
      expect(def.outline[0], `${id}: default has no ring`).toBe('none');

      expect(focus.background, `${id}: focus fill`).toBe(tk.accent);
      expect(focus.outline, `${id}: 3 px ring outside`).toEqual(['solid', '3px', tk.ring, '0px']);

      expect(disabled.ariaDisabled, `${id}: aria-disabled`).toBe('true');
      expect(disabled.opacity, `${id}: disabled is dimmed`).toBe('0.45');
      expect(disabled.background).toBe('rgba(0, 0, 0, 0)');

      expect(danger.labelColor, `${id}: danger label in the error colour`).toBe(tk.danger);
      expect(danger.color, `${id}: danger icon stays ink`).toBe(tk.ink);

      await p.screenshot({ path: `${SHOTS}/states-${id}.png` });
    }

    // The gallery's 360 px panel shows the mobile 44 px targets on a desktop viewport.
    const m = panel(page, 'mobile');
    for (const testId of [
      'menu-item-default',
      'menu-item-focus',
      'menu-item-disabled',
      'menu-item-danger',
    ]) {
      const s = await itemStyle(m.getByTestId(testId));
      expect(s.height, `mobile panel/${testId}: 44 px`).toBe(44);
      expect(s.padding).toEqual(['8px', '12px', '8px', '12px']);
    }
    await m.screenshot({ path: `${SHOTS}/states-mobile-panel.png` });
  });

  test('360 px viewport: items are 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    await expect(p.getByTestId('menu-item-default')).toBeVisible();
    for (const testId of [
      'menu-item-default',
      'menu-item-focus',
      'menu-item-disabled',
      'menu-item-danger',
    ]) {
      const s = await itemStyle(p.getByTestId(testId));
      expect(s.height, `${testId}: 44 px at 360`).toBe(44);
    }
  });

  test('clicking the trigger opens the panel like the light specimen and selecting closes it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    const trigger = p.getByTestId('menu-trigger');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const m = menu(page);
    await expect(m).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-controls', (await m.getAttribute('id'))!);
    // Rendered in the teleport layer on <body>, not inside the gallery panel.
    expect(await m.evaluate((el) => el.parentElement === document.body)).toBe(true);

    const heading = m.locator('.ats-menu__heading');
    await expect(heading).toHaveText('Hồ sơ ứng viên');
    expect(await heading.evaluate((el) => (el as HTMLElement).innerText)).toBe('HỒ SƠ ỨNG VIÊN');
    await expect(m.getByRole('menuitem')).toHaveText(ITEMS);
    await expect(m.getByRole('menuitem').first()).toBeFocused();

    const box = await m.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        padding: s.padding,
        border: [s.borderTopWidth, s.borderTopStyle, s.borderTopColor],
        background: s.backgroundColor,
        headingColor: getComputedStyle(el.querySelector('.ats-menu__heading')!).color,
      };
    });
    expect(box.width).toBeGreaterThanOrEqual(232);
    expect(box.padding).toBe('12px');
    expect(box.border).toEqual(['1px', 'solid', TOKENS.light.line]);
    expect(box.background).toBe(TOKENS.light.surface);
    expect(box.headingColor).toBe(TOKENS.light.muted);

    // Positioned under the trigger, aligned to its start (bottom-start).
    const t = (await trigger.boundingBox())!;
    const b = (await m.boundingBox())!;
    expect(Math.round(b.x)).toBe(Math.round(t.x));
    expect(b.y).toBeGreaterThan(t.y + t.height - 1);
    await page.screenshot({
      path: `${SHOTS}/open-light.png`,
      clip: { ...b, x: b.x - 16, y: b.y - 16, width: b.width + 32, height: b.height + 32 },
    });

    // A disabled item emits nothing and the menu stays open.
    await m.getByRole('menuitem', { name: 'Không khả dụng' }).click({ force: true });
    await expect(m).toBeVisible();
    await expect(p.getByText('Last selected: —')).toBeVisible();

    // Selecting an item emits select and closes the menu, focus back on the trigger.
    await m.getByRole('menuitem', { name: 'Lưu trữ hồ sơ' }).click();
    await expect(m).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    await expect(p.getByText('Last selected: Lưu trữ hồ sơ')).toBeVisible();
  });

  test('keyboard: Arrow Down opens on the first item, arrows skip disabled and wrap, Escape returns focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    const trigger = p.getByTestId('menu-trigger');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const m = menu(page);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const items = m.getByRole('menuitem');
    await expect(items.nth(0)).toBeFocused();

    // Keyboard focus shows the highlighted fill and the 3 px ring, as in "QA · Menu item states".
    const focused = await itemStyle(items.nth(0));
    expect(focused.background).toBe(TOKENS.light.accent);
    expect(focused.outline).toEqual(['solid', '3px', TOKENS.light.ring, '0px']);

    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown'); // skips "Không khả dụng"
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowDown'); // wraps
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowUp'); // wraps back
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('c'); // type-ahead: "Chỉnh sửa hồ sơ"
    await expect(items.nth(1)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(m).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Arrow Up opens on the last enabled item; Enter selects it.
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(m).toBeHidden();
    await expect(p.getByText('Last selected: Chỉnh sửa hồ sơ')).toBeVisible();

    // Tab closes it.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(m).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(m).toBeHidden();
  });

  test('clicking outside closes the menu', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const trigger = panel(page, 'light').getByTestId('menu-trigger');
    await trigger.click();
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(menu(page)).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('dark panel opens a dark menu like the dark specimen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await panel(page, 'dark').getByTestId('menu-trigger').click();
    const m = menu(page);
    await expect(m).toBeVisible();
    await expect(m).toHaveAttribute('data-theme', 'dark');
    const s = await m.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor };
    });
    expect(s.bg).toBe(TOKENS.dark.surface);
    expect(s.border).toBe(TOKENS.dark.line);
    const danger = await itemStyle(m.getByRole('menuitem', { name: 'Lưu trữ hồ sơ' }));
    expect(danger.labelColor).toBe(TOKENS.dark.danger);
    const b = (await m.boundingBox())!;
    await page.screenshot({
      path: `${SHOTS}/open-dark.png`,
      clip: { ...b, x: b.x - 16, y: b.y - 16, width: b.width + 32, height: b.height + 32 },
    });
  });

  test('360 px: opened near the right edge, the panel stays fully inside the viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    for (const testId of ['menu-trigger-end', 'menu-trigger']) {
      const trigger = panel(page, 'light').getByTestId(testId);
      await trigger.scrollIntoViewIfNeeded();
      const t = (await trigger.boundingBox())!;
      if (testId === 'menu-trigger-end') expect(t.x + t.width).toBeGreaterThan(300);
      await trigger.click();
      const m = menu(page);
      await expect(m).toBeVisible();
      const b = (await m.boundingBox())!;
      const vp = await page.evaluate(() => ({
        w: document.documentElement.clientWidth,
        h: document.documentElement.clientHeight,
      }));
      expect(b.x, `${testId}: left edge inside`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${testId}: right edge inside`).toBeLessThanOrEqual(vp.w);
      expect(b.y, `${testId}: top inside`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, `${testId}: bottom inside`).toBeLessThanOrEqual(vp.h);
      for (const item of await m.getByRole('menuitem').all()) {
        expect((await item.boundingBox())!.height, `${testId}: 44 px items in the open menu`).toBe(
          44,
        );
      }
      await page.screenshot({ path: `${SHOTS}/open-360-${testId}.png` });
      await page.keyboard.press('Escape');
      await expect(m).toBeHidden();
    }
  });

  test('360 px: near the bottom of the viewport the panel flips above and stays inside', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/dev/ui');
    const trigger = panel(page, 'light').getByTestId('menu-trigger-end');
    // Bring the trigger to the bottom of the viewport.
    await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.bottom - window.innerHeight + 8);
    });
    await trigger.click();
    const m = menu(page);
    await expect(m).toBeVisible();
    const b = (await m.boundingBox())!;
    const t = (await trigger.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(t.y + 1);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  });
});
