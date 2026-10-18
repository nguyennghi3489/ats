// Issue #45: AtsSelect, checked in the /dev/ui gallery against the design page "01 · Foundations" >
// "QA · Select field states" and "Select field usage and dependencies".
// 36 px control with a 10 px inner gutter and a chevron on the right, error surface + border, error focus
// keeps the error surface and adds the focus ring, disabled opacity, a 44 px tap target below the mobile
// breakpoint, and a long selected label that wraps to two lines on a min 60 px surface (8 px vertical,
// 10 px horizontal inset). Built on a native <select>: the chevron is decorative and lets clicks through,
// and Tab plus the arrow keys work in Chromium and Firefox.
// The component holds no copy (labels come from the caller) and the gallery is developer tooling without
// i18n, so there is no vi/en variant to compare; the demo copy is Vietnamese as in the design.
import { existsSync } from 'node:fs';
import { chromium, expect, firefox, test, type Locator, type Page } from '@playwright/test';

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
  'long',
] as const;

const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra lựa chọn và thử lại.';
const LONG_LABEL = 'Tên tiếng Việt rất dài để kiểm tra xuống dòng trên màn hình hẹp';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsSelect');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const state = (scope: Locator, name: (typeof STATES)[number]) =>
  scope.locator(`section[data-state="${name}"]`);

function boxStyle(locator: Locator) {
  return locator.locator('.ats-select__box').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      height: r.height,
      background: s.backgroundColor,
      borderColor: s.borderTopColor,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
    };
  });
}

test.describe('Select field (AtsSelect)', () => {
  test('the gallery shows every state in light, dark and 360 px panels with the design geometry', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsSelect' })).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      expect(
        await p
          .locator('section[data-state]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))),
      ).toEqual([...STATES]);
      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;

      // Geometry: 6 px label gap, 36 px control, 10 px left gutter, chevron 10 px from the right edge.
      const def = state(p, 'default');
      const g = await def.evaluate((section) => {
        const label = section.querySelector('.ats-field__label')!.getBoundingClientRect();
        const box = section.querySelector('.ats-select__box')!;
        const b = box.getBoundingClientRect();
        const value = section.querySelector('.ats-select__value')!.getBoundingClientRect();
        const chevron = section.querySelector('.ats-select__chevron')!.getBoundingClientRect();
        const select = section.querySelector('select')!.getBoundingClientRect();
        return {
          gap: b.top - label.bottom,
          boxHeight: b.height,
          leftGutter: value.left - b.left,
          chevronRight: b.right - chevron.right,
          chevronCentre: chevron.top + chevron.height / 2 - (b.top + b.height / 2),
          selectCovers:
            select.left <= b.left + 1 &&
            select.right >= b.right - 1 &&
            select.top <= b.top + 1 &&
            select.bottom >= b.bottom - 1,
        };
      });
      expect(g.gap, `${id}: label/control gap`).toBeCloseTo(6, 0);
      expect(g.boxHeight, `${id}: control height`).toBe(36);
      expect(g.leftGutter, `${id}: inner gutter`).toBeCloseTo(10, 0);
      // 10 px from the inside of the 1 px border (the design gives no separate chevron inset).
      expect(g.chevronRight, `${id}: chevron inset`).toBeGreaterThanOrEqual(10);
      expect(g.chevronRight, `${id}: chevron inset`).toBeLessThanOrEqual(11);
      expect(Math.abs(g.chevronCentre), `${id}: chevron centred`).toBeLessThanOrEqual(1);
      expect(g.selectCovers, `${id}: the native select covers the whole control`).toBe(true);

      // Default: field surface and line border, selected label and helper shown.
      const d = await boxStyle(def);
      expect(d.background).toBe(t.fieldSurface);
      expect(d.borderColor).toBe(t.line);
      expect(d.outlineStyle).toBe('none');
      await expect(def.locator('.ats-select__value')).toHaveText('Nguyễn Minh Anh');
      await expect(def.locator('.ats-field__message--helper')).toHaveText(HELPER);

      // Placeholder: muted placeholder text, required marker.
      const ph = state(p, 'placeholder');
      await expect(ph.locator('.ats-select__value')).toHaveText('Chọn loại hình');
      await expect(ph.locator('.ats-field__required')).toHaveText('*');

      // Hover (demo-pinned) uses the action line border.
      expect((await boxStyle(state(p, 'hover'))).borderColor).toBe(t.actionLine);

      // Focus: 3 px focus ring on the field surface.
      const f = await boxStyle(state(p, 'focus'));
      expect(f.outlineStyle).toBe('solid');
      expect(f.outlineWidth).toBe('3px');
      expect(f.outlineColor).toBe(t.focusRing);
      expect(f.background).toBe(t.fieldSurface);

      // Error: error surface + danger border, error text shown, helper hidden.
      const err = state(p, 'error');
      const e = await boxStyle(err);
      expect(e.background).toBe(t.errorSurface);
      expect(e.borderColor).toBe(t.danger);
      expect(e.outlineStyle).toBe('none');
      await expect(err.locator('.ats-field__message--error')).toHaveText(ERROR);
      await expect(err.locator('.ats-field__message--helper')).toHaveCount(0);

      // Error + focus keeps the error surface and border and adds the focus ring.
      const ef = await boxStyle(state(p, 'error-focus'));
      expect(ef.background).toBe(t.errorSurface);
      expect(ef.borderColor).toBe(t.danger);
      expect(ef.outlineStyle).toBe('solid');
      expect(ef.outlineWidth).toBe('3px');
      expect(ef.outlineColor).toBe(t.focusRing);

      // Disabled: the whole field dimmed, select disabled.
      const dis = state(p, 'disabled');
      expect(await dis.locator('.ats-field').evaluate((el) => getComputedStyle(el).opacity)).toBe(
        '0.45',
      );
      await expect(dis.locator('select')).toBeDisabled();
    }

    await page.screenshot({
      path: test.info().outputPath('select-field-light.png'),
      fullPage: true,
    });
    await demo(page).screenshot({ path: test.info().outputPath('select-field-demo-light.png') });
  });

  test('real hover and keyboard focus apply the hover border and the focus ring; disabled has no hover', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const def = state(p, 'default');
    await def.locator('.ats-select__box').hover();
    expect((await boxStyle(def)).borderColor).toBe(TOKENS.light.actionLine);

    const dis = state(p, 'disabled');
    await dis.locator('.ats-select__box').hover();
    expect((await boxStyle(dis)).borderColor, 'disabled has no hover border').toBe(
      TOKENS.light.line,
    );

    // Tab from the focus-state select to the error select: ring appears, error surface stays.
    await state(p, 'focus').locator('select').focus();
    await page.keyboard.press('Tab');
    const err = state(p, 'error');
    await expect(err.locator('select')).toBeFocused();
    const e = await boxStyle(err);
    expect(e.outlineStyle).toBe('solid');
    expect(e.outlineWidth).toBe('3px');
    expect(e.outlineColor).toBe(TOKENS.light.focusRing);
    expect(e.background).toBe(TOKENS.light.errorSurface);
    expect(e.borderColor).toBe(TOKENS.light.danger);
  });

  test('the select is found by its label and carries the field ARIA; the chevron is decorative', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const def = state(p, 'default').getByLabel('Tên hiển thị');
    await expect(def).toHaveRole('combobox');
    await expect(def).toHaveAccessibleName('Tên hiển thị');
    await expect(def).toHaveAccessibleDescription(HELPER);
    await expect(def).not.toHaveAttribute('aria-invalid', /.*/);

    const err = state(p, 'error').getByLabel('Tên ứng viên');
    await expect(err).toHaveAttribute('aria-invalid', 'true');
    await expect(err).toHaveAttribute('aria-required', 'true');
    await expect(err).toHaveAccessibleDescription(ERROR);
    const describedBy = await err.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(ERROR);

    // Chevron and drawn value are hidden from assistive technology.
    for (const name of STATES) {
      await expect(state(p, name).locator('.ats-select__chevron')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      await expect(state(p, name).locator('.ats-select__value')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
    expect(
      await state(p, 'default')
        .locator('.ats-select__chevron')
        .evaluate((el) => getComputedStyle(el).pointerEvents),
    ).toBe('none');

    // Clicking the label focuses the select.
    await state(p, 'placeholder').locator('label').click();
    await expect(state(p, 'placeholder').locator('select')).toBeFocused();

    // Ids are unique across the three panels.
    const ids = await demo(page)
      .locator('select')
      .evaluateAll((els) => els.map((el) => el.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('clicking the chevron reaches the native select, which opens its picker', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const def = state(panel(page, 'light'), 'default');
    const chevron = def.locator('.ats-select__chevron');
    await chevron.scrollIntoViewIfNeeded();
    const r = (await chevron.boundingBox())!;
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;

    // The topmost element under the chevron is the <select> itself.
    const hit = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px!, py!);
        return el?.tagName;
      },
      [x, y],
    );
    expect(hit).toBe('SELECT');

    // A real mouse press at the chevron is delivered to the select (which is what opens the OS picker).
    const select = def.locator('select');
    await select.evaluate((el) => {
      (window as unknown as { __mousedown?: string }).__mousedown = '';
      el.addEventListener('mousedown', () => {
        (window as unknown as { __mousedown?: string }).__mousedown = 'select';
      });
    });
    await page.mouse.click(x, y);
    await expect(select).toBeFocused();
    expect(
      await page.evaluate(() => (window as unknown as { __mousedown?: string }).__mousedown),
    ).toBe('select');
    await page.keyboard.press('Escape');
  });

  test('choosing an option updates the v-model; the placeholder cannot be re-selected', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    // Default, hover, focus, error and disabled share one v-model in the demo.
    const def = state(p, 'default').locator('select');
    await def.selectOption('thu-ha');
    await expect(def).toHaveValue('thu-ha');
    for (const name of ['default', 'hover', 'focus', 'error', 'disabled'] as const) {
      await expect(state(p, name).locator('.ats-select__value')).toHaveText('Trần Thu Hà');
    }
    // A disabled option cannot be chosen.
    await expect(def.locator('option[value="quoc-bao"]')).toBeDisabled();

    // Placeholder: an empty, disabled first option shown while the value is null.
    const ph = state(p, 'placeholder');
    const phSelect = ph.locator('select');
    const first = phSelect.locator('option').first();
    await expect(first).toHaveText('Chọn loại hình');
    await expect(first).toHaveAttribute('value', '');
    await expect(first).toBeDisabled();
    await expect(phSelect).toHaveValue('');
    await expect(ph.locator('.ats-select__value')).toHaveClass(/ats-select__value--placeholder/);

    await phSelect.selectOption('part_time');
    await expect(ph.locator('.ats-select__value')).toHaveText('Bán thời gian');
    await expect(ph.locator('.ats-select__value')).not.toHaveClass(
      /ats-select__value--placeholder/,
    );
    // Keyboard cannot move back onto the disabled placeholder either.
    await phSelect.focus();
    await page.keyboard.press('Home');
    await expect(phSelect).not.toHaveValue('');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`at 360 px (${scheme}) a long label wraps to two lines on a min 60 px surface, with 44 px tap targets`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/dev/ui');

      const p = panel(page, 'light');
      const long = state(p, 'long');
      await long.scrollIntoViewIfNeeded();
      await expect(long.locator('.ats-select__value')).toHaveText(LONG_LABEL);

      const m = await long.evaluate((section) => {
        const box = section.querySelector('.ats-select__box')!;
        const b = box.getBoundingClientRect();
        const value = section.querySelector('.ats-select__value')!;
        const v = value.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(value).lineHeight);
        const s = section.querySelector('select')!.getBoundingClientRect();
        return {
          boxHeight: b.height,
          lines: Math.round(v.height / lineHeight),
          truncated: value.scrollHeight > value.clientHeight + 1,
          insetTop: v.top - b.top,
          insetLeft: v.left - b.left,
          selectHeight: s.height,
          boxRight: b.right,
          vw: window.innerWidth,
        };
      });
      expect(m.lines, 'two lines').toBe(2);
      expect(m.truncated, 'two lines fit without clipping').toBe(false);
      expect(m.boxHeight, 'min 60 px surface').toBeGreaterThanOrEqual(60);
      expect(m.insetTop, '8 px vertical inset').toBeGreaterThanOrEqual(8);
      expect(m.insetLeft, '10 px horizontal inset').toBeCloseTo(10, 0);
      expect(m.selectHeight).toBeGreaterThanOrEqual(44);
      expect(m.boxRight).toBeLessThanOrEqual(m.vw);

      // Short values keep the 36 px surface and get a 44 px tap target.
      const def = await state(p, 'default').evaluate((section) => ({
        box: section.querySelector('.ats-select__box')!.getBoundingClientRect().height,
        select: section.querySelector('select')!.getBoundingClientRect().height,
      }));
      expect(def.box).toBe(36);
      expect(def.select).toBe(44);

      const heights = await p
        .locator('select')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(heights.every((h) => h >= 44)).toBe(true);

      await page.screenshot({
        path: test.info().outputPath(`select-field-360-${scheme}.png`),
        fullPage: true,
      });
    });
  }

  test('screenshot of the dark app theme for design comparison', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    expect((await boxStyle(state(panel(page, 'dark'), 'error'))).background).toBe(
      TOKENS.dark.errorSurface,
    );
    await demo(page).screenshot({ path: test.info().outputPath('select-field-dark-app.png') });
  });

  // Keyboard: Tab focuses the select and the arrow keys change the value (Chromium here, Firefox below).
  async function keyboardFlow(page: Page) {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    const ph = state(p, 'placeholder').locator('select');
    // Start from the select before it, then Tab.
    await state(p, 'default').locator('select').focus();
    await page.keyboard.press('Tab');
    await expect(ph).toBeFocused();
    await expect(ph).toHaveValue('');
    await page.keyboard.press('ArrowDown');
    await expect(ph).toHaveValue('full_time');
    await expect(state(p, 'placeholder').locator('.ats-select__value')).toHaveText(
      'Toàn thời gian',
    );
    await page.keyboard.press('ArrowDown');
    await expect(ph).toHaveValue('part_time');
    await page.keyboard.press('ArrowUp');
    await expect(ph).toHaveValue('full_time');
    // ArrowUp from the first real option does not land on the placeholder.
    await page.keyboard.press('ArrowUp');
    await expect(ph).toHaveValue('full_time');
  }

  // On macOS the arrow keys open the native picker of any closed <select> instead of changing its value
  // (a plain <select> behaves the same), and headless browsers cannot drive that picker. There the
  // keyboard checks need a Linux browser: set PW_REMOTE_WS to a `playwright run-server` endpoint whose
  // browsers reach the dev server at the same base URL.
  const remoteWs = process.env.PW_REMOTE_WS;
  const arrowsOpenPicker = process.platform === 'darwin' && !remoteWs;
  const PICKER_REASON =
    'macOS: arrow keys open the native picker; set PW_REMOTE_WS to run on a Linux browser';

  for (const browserType of [chromium, firefox]) {
    const name = browserType.name();
    test(`keyboard: Tab focuses the select and arrow keys change the value (${name})`, async ({
      baseURL,
    }) => {
      test.skip(arrowsOpenPicker, PICKER_REASON);
      test.skip(
        !remoteWs && !existsSync(browserType.executablePath()),
        `${name} is not installed (pnpm exec playwright install ${name})`,
      );
      const browser = remoteWs ? await browserType.connect(remoteWs) : await browserType.launch();
      try {
        const page = await browser.newPage({ baseURL });
        await keyboardFlow(page);
        await page.screenshot({
          path: test.info().outputPath(`select-field-keyboard-${name}.png`),
        });
      } finally {
        await browser.close();
      }
    });
  }
});
