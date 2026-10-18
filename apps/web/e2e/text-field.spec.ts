// Issue #44: AtsTextField and the shared AtsField wrapper, checked in the /dev/ui gallery against the
// design page "01 · Foundations" > "QA · Text field states" and "QA · Fields Error focus assembled proof".
// Label/control gap 6 px, 36 px control with a 10 px inner gutter, error surface + border, error focus
// keeps the error surface and adds the focus ring, disabled opacity, read-only without hover, a 44 px
// tap target below the mobile breakpoint, and single-line values that scroll instead of wrapping.
// The component holds no copy (labels come from the caller) and the gallery is developer tooling
// without i18n, so there is no vi/en variant to compare here; the demo copy is Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    fieldSurface: 'rgb(252, 252, 250)',
    line: 'rgb(177, 175, 165)',
    actionLine: 'rgb(121, 135, 82)',
    danger: 'rgb(164, 41, 41)',
    errorSurface: 'rgb(248, 226, 223)',
    focusRing: 'rgb(41, 40, 34)',
  },
  dark: {
    fieldSurface: 'rgb(50, 51, 46)',
    line: 'rgb(118, 119, 108)',
    actionLine: 'rgb(121, 135, 82)',
    danger: 'rgb(255, 181, 172)',
    errorSurface: 'rgb(42, 43, 39)',
    focusRing: 'rgb(244, 241, 232)',
  },
} as const;

const STATES = [
  'default',
  'placeholder',
  'hover',
  'focus',
  'error',
  'error-focus',
  'disabled',
  'readonly',
  'long',
  'email',
] as const;

const LONG_VALUE = 'Chuyên viên thiết kế trải nghiệm người dùng cấp cao ở Hà Nội';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsTextField');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const state = (scope: Locator, name: (typeof STATES)[number]) =>
  scope.locator(`section[data-state="${name}"]`);

function boxStyle(locator: Locator) {
  return locator.locator('.ats-text-field__box').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      height: r.height,
      background: s.backgroundColor,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
    };
  });
}

test.describe('Text field (AtsTextField / AtsField)', () => {
  test('the gallery shows every state in light, dark and 360 px panels with the design geometry', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsTextField' })).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      expect(
        await p
          .locator('section[data-state]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))),
      ).toEqual([...STATES]);
      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;

      // Geometry: 36 px control, 6 px label gap, 10 px inner gutter (1 px border + 9 px padding).
      const def = state(p, 'default');
      const geometry = await def.evaluate((section) => {
        const label = section.querySelector('.ats-field__label')!.getBoundingClientRect();
        const box = section.querySelector('.ats-text-field__box')!;
        const input = section.querySelector('input')!;
        const b = box.getBoundingClientRect();
        return {
          gap: b.top - label.bottom,
          boxHeight: b.height,
          gutter:
            parseFloat(getComputedStyle(box).borderLeftWidth) +
            parseFloat(getComputedStyle(input).paddingLeft),
          inputHeight: input.getBoundingClientRect().height,
        };
      });
      expect(geometry.gap, `${id}: label/control gap`).toBeCloseTo(6, 0);
      expect(geometry.boxHeight, `${id}: control height`).toBe(36);
      expect(geometry.gutter, `${id}: inner gutter`).toBe(10);
      // Desktop viewport: the input fills the inside of the 1 px border (no 44 px target above the breakpoint).
      expect(geometry.inputHeight, `${id}: desktop input height`).toBe(34);

      // Default: field surface and line border, helper text visible.
      const d = await boxStyle(def);
      expect(d.background).toBe(t.fieldSurface);
      expect(d.borderColor).toBe(t.line);
      expect(d.outlineStyle).toBe('none');
      await expect(def.locator('.ats-field__message--helper')).toHaveText(
        'Thông tin này được dùng trong hồ sơ chia sẻ.',
      );

      // Hover (demo-pinned) uses the action line border.
      expect((await boxStyle(state(p, 'hover'))).borderColor).toBe(t.actionLine);

      // Focus: 3 px focus ring.
      const f = await boxStyle(state(p, 'focus'));
      expect(f.outlineStyle).toBe('solid');
      expect(f.outlineWidth).toBe('3px');
      expect(f.outlineColor).toBe(t.focusRing);
      expect(f.background).toBe(t.fieldSurface);

      // Error: error surface + danger border, error text shown, helper text hidden.
      const err = state(p, 'error');
      const e = await boxStyle(err);
      expect(e.background).toBe(t.errorSurface);
      expect(e.borderColor).toBe(t.danger);
      await expect(err.locator('.ats-field__message--error')).toHaveText(
        'Vui lòng kiểm tra nội dung đã nhập',
      );
      await expect(err.locator('.ats-field__message--helper')).toHaveCount(0);
      await expect(err.getByText('Thông tin này được dùng trong hồ sơ chia sẻ.')).toHaveCount(0);

      // Error + focus keeps the error surface and border and adds the focus ring.
      const ef = await boxStyle(state(p, 'error-focus'));
      expect(ef.background).toBe(t.errorSurface);
      expect(ef.borderColor).toBe(t.danger);
      expect(ef.outlineStyle).toBe('solid');
      expect(ef.outlineWidth).toBe('3px');
      expect(ef.outlineColor).toBe(t.focusRing);

      // Disabled: the whole field dimmed with the disabled opacity, input disabled.
      const dis = state(p, 'disabled');
      expect(await dis.locator('.ats-field').evaluate((el) => getComputedStyle(el).opacity)).toBe(
        '0.45',
      );
      await expect(dis.locator('input')).toBeDisabled();

      // Read-only: not editable, same surface as default.
      const ro = state(p, 'readonly');
      await expect(ro.locator('input')).not.toBeEditable();
      expect((await boxStyle(ro)).background).toBe(t.fieldSurface);

      // Required marker on the required states.
      await expect(state(p, 'placeholder').locator('.ats-field__required')).toHaveText('*');
      await expect(state(p, 'error').locator('.ats-field__required')).toHaveText('*');
    }

    await page.screenshot({ path: test.info().outputPath('text-field-light.png'), fullPage: true });
  });

  test('real hover and keyboard focus apply the hover border and the focus ring; read-only has no hover', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const def = state(p, 'default');
    await def.locator('input').hover();
    expect((await boxStyle(def)).borderColor).toBe(TOKENS.light.actionLine);

    const ro = state(p, 'readonly');
    await ro.locator('input').hover();
    expect((await boxStyle(ro)).borderColor, 'read-only has no hover border').toBe(
      TOKENS.light.line,
    );

    const disabled = state(p, 'disabled');
    await disabled.locator('.ats-text-field__box').hover();
    expect((await boxStyle(disabled)).borderColor, 'disabled has no hover border').toBe(
      TOKENS.light.line,
    );

    // Keyboard focus on the error field: error surface stays, ring appears.
    const err = state(p, 'error');
    await state(p, 'hover').locator('input').focus();
    await page.keyboard.press('Tab'); // focus -> next field
    await page.keyboard.press('Tab'); // -> error field
    await expect(err.locator('input')).toBeFocused();
    const e = await boxStyle(err);
    expect(e.outlineStyle).toBe('solid');
    expect(e.outlineWidth).toBe('3px');
    expect(e.background).toBe(TOKENS.light.errorSurface);
    expect(e.borderColor).toBe(TOKENS.light.danger);
  });

  test('clicking the label focuses the input and the input carries the field ARIA', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const required = state(p, 'placeholder');
    const input = required.getByLabel('Tên ứng viên');
    await expect(input).toHaveAttribute('placeholder', 'Nhập tên đầy đủ');
    await expect(input).toHaveAttribute('aria-required', 'true');
    await expect(input).toHaveAccessibleName('Tên ứng viên');
    // The visible label carries the aria-hidden required marker.
    const label = required.locator('label');
    await expect(label).toHaveText('Tên ứng viên*');
    await expect(label.locator('[aria-hidden="true"]')).toHaveText('*');
    await label.click();
    await expect(input).toBeFocused();

    const err = state(p, 'error');
    const errInput = err.getByLabel('Tên ứng viên');
    await expect(errInput).toHaveAttribute('aria-invalid', 'true');
    await expect(errInput).toHaveAccessibleDescription('Vui lòng kiểm tra nội dung đã nhập');

    const def = state(p, 'default').getByLabel('Tên hiển thị');
    await expect(def).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(def).toHaveAccessibleDescription('Thông tin này được dùng trong hồ sơ chia sẻ.');

    // Ids are unique across the three panels.
    const ids = await demo(page)
      .locator('input')
      .evaluateAll((els) => els.map((el) => el.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('typing updates the v-model value; read-only ignores typing but its value can be selected', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    // The demo binds default, hover and read-only to the same v-model, so typing shows up in all three.
    const def = state(p, 'default').locator('input');
    await def.fill('Trần Thu Hà');
    await expect(def).toHaveValue('Trần Thu Hà');
    await expect(state(p, 'hover').locator('input')).toHaveValue('Trần Thu Hà');
    await expect(state(p, 'readonly').locator('input')).toHaveValue('Trần Thu Hà');

    const ro = state(p, 'readonly').locator('input');
    await ro.click();
    await page.keyboard.press('End');
    await page.keyboard.type('XYZ');
    await expect(ro).toHaveValue('Trần Thu Hà');
    await expect(def).toHaveValue('Trần Thu Hà');

    await ro.selectText();
    const selected = await ro.evaluate((el: HTMLInputElement) =>
      el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0),
    );
    expect(selected).toBe('Trần Thu Hà');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`at 360 px (${scheme}) a 60-character Vietnamese value stays on one line and scrolls, with a 44 px tap target`, async ({
      page,
    }) => {
      expect([...LONG_VALUE].length).toBe(60);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/dev/ui');

      const p = panel(page, 'light');
      const long = state(p, 'long');
      const input = long.locator('input');
      await expect(input).toHaveValue(LONG_VALUE);
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeInViewport();

      const m = await long.evaluate((section) => {
        const box = section.querySelector('.ats-text-field__box')!.getBoundingClientRect();
        const input = section.querySelector('input')!;
        const r = input.getBoundingClientRect();
        return {
          boxHeight: box.height,
          inputHeight: r.height,
          inputTop: r.top - box.top,
          scrollWidth: input.scrollWidth,
          clientWidth: input.clientWidth,
          whiteSpace: getComputedStyle(input).whiteSpace,
          vw: window.innerWidth,
          boxRight: box.right,
        };
      });
      expect(m.boxHeight, 'visible surface stays 36 px').toBe(36);
      expect(m.inputHeight, '44 px tap target').toBe(44);
      expect(m.inputTop, 'target centred on the surface').toBeCloseTo(-4, 0);
      expect(m.whiteSpace).toBe('nowrap');
      expect(m.scrollWidth, 'value is wider than the field, so it scrolls').toBeGreaterThan(
        m.clientWidth,
      );
      expect(m.boxRight).toBeLessThanOrEqual(m.vw);

      // The value scrolls horizontally (the End key is platform-specific, so scroll directly), and typing
      // at the end keeps the caret in view on the same line.
      const scrolled = await input.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
        return el.scrollLeft;
      });
      expect(scrolled, 'input scrolls horizontally').toBeGreaterThan(0);
      await input.focus();
      await input.evaluate((el: HTMLInputElement) =>
        el.setSelectionRange(el.value.length, el.value.length),
      );
      await page.keyboard.type(' 2026');
      await expect(input).toHaveValue(`${LONG_VALUE} 2026`);
      await expect
        .poll(() => input.evaluate((el) => el.scrollLeft), { message: 'caret kept in view' })
        .toBeGreaterThan(0);
      expect((await boxStyle(long)).height, 'still one line').toBe(36);

      // Tap targets of every text field in the panel are 44 px on mobile.
      const heights = await p
        .locator('input')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(heights.every((h) => h === 44)).toBe(true);

      await page.screenshot({
        path: test.info().outputPath(`text-field-360-${scheme}.png`),
        fullPage: true,
      });
    });
  }

  test('screenshots of the dark app theme for design comparison', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    // Light and dark panels keep their own theme when the app is dark.
    expect((await boxStyle(state(panel(page, 'light'), 'error'))).background).toBe(
      TOKENS.light.errorSurface,
    );
    expect((await boxStyle(state(panel(page, 'dark'), 'error'))).background).toBe(
      TOKENS.dark.errorSurface,
    );
    await demo(page).screenshot({ path: test.info().outputPath('text-field-dark-app.png') });
  });
});
