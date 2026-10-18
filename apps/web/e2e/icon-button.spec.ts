// Issue #43: AtsIconButton in the dev gallery (/dev/ui), checked in a real browser against the design
// page "01 · Foundations" (ATS / Icon button, the Light/Dark/Mobile specimens and "QA · Icon button
// states"): 36 px desktop, 44 px mobile, 16 px icon centred, 3 px focus stroke inside, no geometry shift.
// The component holds no copy of its own (the caller passes the translated label) and the gallery is
// developer tooling, so there is no vi/en variant to compare beyond the label the demo passes.
import { expect, test, type Locator, type Page } from '@playwright/test';

const STATES = ['Default', 'Hover', 'Pressed', 'Focus', 'Disabled', 'Pending'];
const PANELS = ['light', 'dark', 'mobile'] as const;

// Semantic tokens from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    control: 'rgb(255, 255, 255)',
    accent: 'rgb(231, 225, 251)',
    line: 'rgb(177, 175, 165)',
    actionLine: 'rgb(121, 135, 82)',
    focusRing: 'rgb(41, 40, 34)',
  },
  dark: {
    control: 'rgb(50, 51, 46)',
    accent: 'rgb(73, 66, 82)',
    line: 'rgb(118, 119, 108)',
    actionLine: 'rgb(121, 135, 82)',
    focusRing: 'rgb(244, 241, 232)',
  },
};

const demo = (page: Page) => page.getByTestId('ui-demo-AtsIconButton');
const panel = (page: Page, id: (typeof PANELS)[number]) =>
  demo(page).locator(`[data-panel="${id}"]`);

const style = (locator: Locator) =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset,
      opacity: s.opacity,
    };
  });

async function size(locator: Locator) {
  const box = await locator.boundingBox();
  return { width: box?.width, height: box?.height };
}

/**
 * The icon is 16 × 16 and its centre is the button's centre. The size comes from the computed style,
 * because the pending spinner rotates and its bounding box grows while it spins (about its centre).
 */
async function expectIconCentred(button: Locator) {
  const icon = button.locator('svg');
  const b = await button.boundingBox();
  const i = await icon.boundingBox();
  const drawn = await icon.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.width, s.height];
  });
  expect(drawn).toEqual(['16px', '16px']);
  expect(Math.abs(i!.x + i!.width / 2 - (b!.x + b!.width / 2))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(i!.y + i!.height / 2 - (b!.y + b!.height / 2))).toBeLessThanOrEqual(0.5);
}

test.describe('AtsIconButton in /dev/ui', () => {
  test('shows Default, Hover, Pressed, Focus, Disabled and Pending in light, dark and mobile', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2 })).toHaveText('AtsIconButton');

    for (const id of PANELS) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      const captions = p.locator('.icon-button-demo__caption');
      expect((await captions.allTextContents()).slice(0, 6)).toEqual(STATES);
      // State row plus the icon swap row (edit, close, chevron-down, archive-box).
      await expect(p.locator('button.ats-icon-button')).toHaveCount(10);

      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;
      const btn = (state: string) => p.getByTestId(`icon-button-${state}`);

      const def = await style(btn('default'));
      expect(def.background, `${id} default background`).toBe(t.control);
      expect(def.borderColor, `${id} default border`).toBe(t.line);
      expect(def.borderWidth).toBe('1px');
      expect(def.outlineStyle).toBe('none');

      expect((await style(btn('hover'))).background, `${id} hover`).toBe(t.accent);

      const pressed = await style(btn('pressed'));
      expect(pressed.background, `${id} pressed background`).toBe(t.accent);
      expect(pressed.borderColor, `${id} pressed border`).toBe(t.actionLine);

      const focus = await style(btn('focus'));
      expect(focus.outlineStyle).toBe('solid');
      expect(focus.outlineWidth).toBe('3px');
      expect(focus.outlineOffset).toBe('-3px');
      expect(focus.outlineColor, `${id} focus ring`).toBe(t.focusRing);

      await expect(btn('disabled')).toBeDisabled();
      expect((await style(btn('disabled'))).opacity).toBe('0.45');

      await expect(btn('pending')).toHaveAttribute('aria-busy', 'true');
      await expect(btn('pending')).toBeEnabled();
      await expect(btn('pending').locator('svg')).toHaveClass(/ats-icon--spin/);
      await expect(btn('default').locator('svg')).not.toHaveClass(/ats-icon--spin/);

      // Every state keeps the same square: 36 px on desktop panels, 44 px in the 360 px panel.
      const side = id === 'mobile' ? 44 : 36;
      for (const state of STATES) {
        const b = btn(state.toLowerCase());
        expect(await size(b), `${id} / ${state}`).toEqual({ width: side, height: side });
        await expectIconCentred(b);
      }

      await p.screenshot({ path: test.info().outputPath(`icon-button-${id}.png`) });
    }
  });

  test('the dark app theme keeps the light and dark specimens', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dev/ui');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    expect((await style(panel(page, 'light').getByTestId('icon-button-default'))).background).toBe(
      TOKENS.light.control,
    );
    expect((await style(panel(page, 'dark').getByTestId('icon-button-default'))).background).toBe(
      TOKENS.dark.control,
    );
    expect((await style(panel(page, 'mobile').getByTestId('icon-button-hover'))).background).toBe(
      TOKENS.dark.accent,
    );
    await demo(page).screenshot({ path: test.info().outputPath('icon-button-app-dark.png') });
  });

  test('is found by role and name and renders no visible text', async ({ page }) => {
    await page.goto('/dev/ui');
    const named = panel(page, 'light').getByRole('button', { name: 'Xóa' });
    // All six states carry the name, the disabled one included.
    await expect(named).toHaveCount(6);
    for (const b of await named.all()) {
      await expect(b).toHaveAttribute('title', 'Xóa');
      expect((await b.innerText()).trim()).toBe('');
    }
    await expect(panel(page, 'light').getByRole('button', { name: 'Đóng' })).toHaveCount(1);
    await expect(panel(page, 'light').getByRole('button', { name: 'Sửa' })).toHaveCount(1);
  });

  test('real hover, press and keyboard focus restyle the button without moving its geometry (desktop)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');
    const button = panel(page, 'light').getByTestId('icon-button-default');
    const before = await button.boundingBox();
    expect(await size(button)).toEqual({ width: 36, height: 36 });

    await button.hover();
    expect((await style(button)).background).toBe(TOKENS.light.accent);

    await page.mouse.down();
    const pressed = await style(button);
    expect(pressed.borderColor).toBe(TOKENS.light.actionLine);
    expect(await button.boundingBox()).toEqual(before);
    await page.mouse.up();

    await page.mouse.move(0, 0);
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const focused = await style(button);
    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineWidth).toBe('3px');
    expect(focused.outlineOffset).toBe('-3px');
    expect(await size(button)).toEqual({ width: 36, height: 36 });
    expect(await button.boundingBox()).toEqual(before);
    await expectIconCentred(button);
    await button.screenshot({ path: test.info().outputPath('icon-button-desktop-focus.png') });

    // Disabled takes no focus: Tab from Focus goes past Disabled to Pending, which keeps focus.
    await panel(page, 'light').getByTestId('icon-button-focus').focus();
    await page.keyboard.press('Tab');
    await expect(panel(page, 'light').getByTestId('icon-button-pending')).toBeFocused();
  });

  test('is 44 × 44 px at 360 px width, with and without focus', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');

    for (const id of PANELS) {
      const button = panel(page, id).getByTestId('icon-button-default');
      await button.scrollIntoViewIfNeeded();
      expect(await size(button), `${id} unfocused`).toEqual({ width: 44, height: 44 });
      await expectIconCentred(button);

      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      expect((await style(button)).outlineWidth).toBe('3px');
      expect(await size(button), `${id} focused`).toEqual({ width: 44, height: 44 });
      await expectIconCentred(button);
    }

    await page.screenshot({ path: test.info().outputPath('icon-button-360.png'), fullPage: true });
  });

  test('clicking a pending or disabled button does nothing in the browser', async ({ page }) => {
    await page.goto('/dev/ui');
    const pending = panel(page, 'light').getByTestId('icon-button-pending');
    const url = page.url();
    await pending.click();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await expect(pending).toBeFocused();
    await panel(page, 'light').getByTestId('icon-button-disabled').click({ force: true });
    expect(page.url()).toBe(url);
  });
});
