// Issue #46: AtsTextarea, checked in the /dev/ui gallery against the design page "01 · Foundations" >
// "ATS / Textarea", the Light/Dark/narrow mobile specimens and "QA · Textarea states":
// label/control/support gap 8 px, control at least 96 px high with a 12 px inset, one helper or error
// message below, error surface + border, error focus keeps the error surface and adds the focus ring,
// disabled opacity, read-only, long Vietnamese text wraps, vertical-only resize.
// The component holds no copy (labels come from the caller) and the gallery is developer tooling
// without i18n, so there is no vi/en variant to compare; the demo copy is Vietnamese as in the design.
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
  'short-error',
  'unbroken',
] as const;

const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra nội dung và thử lại.';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsTextarea');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const state = (scope: Locator, name: (typeof STATES)[number]) =>
  scope.locator(`section[data-state="${name}"]`);

function controlStyle(section: Locator) {
  return section.locator('textarea').evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      height: r.height,
      width: r.width,
      background: s.backgroundColor,
      borderColor: s.borderTopColor,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      resize: s.resize,
      overflowX: s.overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
    };
  });
}

test.describe('Textarea (AtsTextarea)', () => {
  test('the gallery shows every state in light, dark and 360 px panels with the design geometry and tokens', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsTextarea' })).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      expect(
        await p
          .locator('section[data-state]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))),
      ).toEqual([...STATES]);
      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;

      // Geometry: label/control/message 8 px apart, control at least 96 px, 12 px inset.
      const def = state(p, 'default');
      const g = await def.evaluate((section) => {
        const label = section.querySelector('.ats-field__label')!.getBoundingClientRect();
        const ta = section.querySelector('textarea')!;
        const msg = section.querySelector('.ats-field__message')!.getBoundingClientRect();
        const c = ta.getBoundingClientRect();
        const s = getComputedStyle(ta);
        return {
          labelGap: c.top - label.bottom,
          messageGap: msg.top - c.bottom,
          height: c.height,
          insetLeft: parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
          insetTop: parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop),
        };
      });
      expect(g.labelGap, `${id}: label/control gap`).toBeCloseTo(8, 0);
      expect(g.messageGap, `${id}: control/message gap`).toBeCloseTo(8, 0);
      expect(g.height, `${id}: control min height`).toBeGreaterThanOrEqual(96);
      expect(g.insetLeft, `${id}: horizontal inset`).toBe(12);
      expect(g.insetTop, `${id}: vertical inset`).toBe(12);

      // Every textarea in the panel is at least 96 px high.
      const heights = await p
        .locator('textarea')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(
        heights.every((h) => h >= 96),
        `${id}: all >= 96 px (${heights.join(', ')})`,
      ).toBe(true);

      // Default: field surface, line border, no ring, helper text visible.
      const d = await controlStyle(def);
      expect(d.background).toBe(t.fieldSurface);
      expect(d.borderColor).toBe(t.line);
      expect(d.outlineStyle).toBe('none');
      await expect(def.locator('textarea')).toHaveValue('Nguyễn Minh Anh');
      await expect(def.locator('.ats-field__label')).toHaveText('Ghi chú');
      await expect(def.locator('.ats-field__message--helper')).toHaveText(HELPER);

      // Hover (demo-pinned) uses the action line border.
      expect((await controlStyle(state(p, 'hover'))).borderColor).toBe(t.actionLine);

      // Focus: 3 px focus ring on the field surface.
      const f = await controlStyle(state(p, 'focus'));
      expect(f.outlineStyle).toBe('solid');
      expect(f.outlineWidth).toBe('3px');
      expect(f.outlineColor).toBe(t.focusRing);
      expect(f.background).toBe(t.fieldSurface);

      // Error: error surface + danger border, exactly one message (the error).
      const err = state(p, 'error');
      const e = await controlStyle(err);
      expect(e.background).toBe(t.errorSurface);
      expect(e.borderColor).toBe(t.danger);
      await expect(err.locator('.ats-field__message')).toHaveCount(1);
      await expect(err.locator('.ats-field__message--error')).toHaveText(ERROR);
      await expect(err.getByText(HELPER)).toHaveCount(0);
      await expect(err.locator('textarea')).toHaveAttribute('aria-invalid', 'true');
      await expect(err.locator('textarea')).toHaveAccessibleDescription(ERROR);

      // Error + focus keeps the error surface and border and adds the focus ring.
      const ef = await controlStyle(state(p, 'error-focus'));
      expect(ef.background).toBe(t.errorSurface);
      expect(ef.borderColor).toBe(t.danger);
      expect(ef.outlineStyle).toBe('solid');
      expect(ef.outlineWidth).toBe('3px');
      expect(ef.outlineColor).toBe(t.focusRing);

      // Disabled: whole field dimmed with the disabled opacity, textarea disabled, no resize.
      const dis = state(p, 'disabled');
      expect(await dis.locator('.ats-field').evaluate((el) => getComputedStyle(el).opacity)).toBe(
        '0.45',
      );
      await expect(dis.locator('textarea')).toBeDisabled();
      expect((await controlStyle(dis)).resize).toBe('none');

      // Read-only: not editable, field surface, value shown in full (helper still below).
      const ro = state(p, 'readonly');
      await expect(ro.locator('textarea')).not.toBeEditable();
      await expect(ro.locator('textarea')).toHaveAttribute('readonly', '');
      expect((await controlStyle(ro)).background).toBe(t.fieldSurface);
      await expect(ro.locator('.ats-field__message--helper')).toHaveText(
        'Chỉ đọc · nội dung vẫn hiển thị đầy đủ',
      );

      // Light specimen: short value with the length error.
      const se = state(p, 'short-error');
      await expect(se.locator('textarea')).toHaveValue('Nội dung quá ngắn');
      await expect(se.locator('.ats-field__message--error')).toHaveText(
        'Mô tả cần có ít nhất 80 ký tự',
      );

      // Required marker.
      await expect(state(p, 'placeholder').locator('.ats-field__required')).toHaveText('*');
      await expect(state(p, 'placeholder').locator('textarea')).toHaveAttribute(
        'aria-required',
        'true',
      );

      // Long and unbroken Vietnamese text wrap inside the control instead of scrolling sideways.
      for (const name of ['long', 'error-focus', 'readonly', 'unbroken'] as const) {
        const m = await controlStyle(state(p, name));
        expect(m.scrollWidth, `${id}/${name}: no horizontal overflow`).toBeLessThanOrEqual(
          m.clientWidth,
        );
        expect(m.overflowX).toBe('hidden');
      }
    }

    await page.screenshot({ path: test.info().outputPath('textarea-light.png'), fullPage: true });
    await demo(page).screenshot({ path: test.info().outputPath('textarea-demo-light.png') });
  });

  test('real hover and keyboard focus apply the hover border and focus ring; read-only and disabled have no hover', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');

    const def = state(p, 'default');
    await def.locator('textarea').hover();
    expect((await controlStyle(def)).borderColor).toBe(TOKENS.light.actionLine);

    const ro = state(p, 'readonly');
    await ro.locator('textarea').hover();
    expect((await controlStyle(ro)).borderColor, 'read-only has no hover border').not.toBe(
      TOKENS.light.actionLine,
    );

    const dis = state(p, 'disabled');
    await dis.locator('textarea').hover({ force: true });
    expect((await controlStyle(dis)).borderColor, 'disabled has no hover border').toBe(
      TOKENS.light.line,
    );

    // Keyboard focus moves from the focus demo to the error field; the error surface stays.
    await state(p, 'focus').locator('textarea').focus();
    await page.keyboard.press('Tab');
    const err = state(p, 'error');
    await expect(err.locator('textarea')).toBeFocused();
    const e = await controlStyle(err);
    expect(e.outlineStyle).toBe('solid');
    expect(e.outlineWidth).toBe('3px');
    expect(e.outlineColor).toBe(TOKENS.light.focusRing);
    expect(e.background).toBe(TOKENS.light.errorSurface);
    expect(e.borderColor).toBe(TOKENS.light.danger);
  });

  test('clicking the label focuses the textarea; typing and Enter update the v-model with a new line', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    const url = page.url();

    const required = state(p, 'placeholder');
    const ta = required.getByLabel('Nhãn trường');
    await expect(ta).toHaveAttribute(
      'placeholder',
      'Nhập ghi chú chi tiết cho ứng viên, bao gồm bối cảnh và bước tiếp theo.',
    );
    await required.locator('label').click();
    await expect(ta).toBeFocused();

    // Default, hover and disabled share one v-model in the demo.
    const def = state(p, 'default').locator('textarea');
    await def.click();
    await def.press('ControlOrMeta+a');
    await page.keyboard.type('Dòng một');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Dòng hai');
    await expect(def).toHaveValue('Dòng một\nDòng hai');
    await expect(state(p, 'hover').locator('textarea')).toHaveValue('Dòng một\nDòng hai');
    await expect(state(p, 'disabled').locator('textarea')).toHaveValue('Dòng một\nDòng hai');
    expect(page.url(), 'Enter does not navigate').toBe(url);

    // Read-only ignores typing.
    const ro = state(p, 'readonly').locator('textarea');
    const before = await ro.inputValue();
    await ro.click();
    await page.keyboard.type('XYZ');
    await page.keyboard.press('Enter');
    await expect(ro).toHaveValue(before);

    // Ids are unique across the three panels.
    const ids = await demo(page)
      .locator('textarea')
      .evaluateAll((els) => els.map((el) => el.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the control resizes vertically with its handle but never horizontally', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const section = state(panel(page, 'light'), 'long');
    const ta = section.locator('textarea');
    await ta.scrollIntoViewIfNeeded();
    const before = await controlStyle(section);
    expect(before.resize).toBe('vertical');

    const box = (await ta.boundingBox())!;
    // Drag the bottom-right resize handle down and to the right.
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 120, box.y + box.height + 80, { steps: 10 });
    await page.mouse.up();

    const after = await controlStyle(section);
    expect(after.height, 'grows vertically').toBeGreaterThan(before.height + 40);
    expect(after.width, 'width unchanged').toBeCloseTo(before.width, 0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`at a 360 px viewport (${scheme}) long Vietnamese text wraps and nothing overflows the page`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/dev/ui');

      for (const id of ['light', 'dark', 'mobile'] as const) {
        const p = panel(page, id);
        for (const name of ['long', 'unbroken', 'error-focus'] as const) {
          const section = state(p, name);
          await section.scrollIntoViewIfNeeded();
          const m = await controlStyle(section);
          expect(m.height).toBeGreaterThanOrEqual(96);
          expect(m.scrollWidth, `${id}/${name}: wraps`).toBeLessThanOrEqual(m.clientWidth);
          const right = await section
            .locator('textarea')
            .evaluate((el) => el.getBoundingClientRect().right);
          expect(right, `${id}/${name}: inside viewport`).toBeLessThanOrEqual(360);
        }
      }

      // Typing a long line at the end wraps onto more lines rather than scrolling sideways.
      const long = state(panel(page, 'mobile'), 'long');
      const ta = long.locator('textarea');
      await ta.focus();
      await ta.evaluate((el: HTMLTextAreaElement) =>
        el.setSelectionRange(el.value.length, el.value.length),
      );
      await page.keyboard.type(' Ứngviênđãhoànthànhvòngphỏngvấnkỹthuậtvàcầntraođổithêm');
      const m = await controlStyle(long);
      expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
      expect(await ta.evaluate((el) => el.scrollLeft)).toBe(0);

      await demo(page).screenshot({
        path: test.info().outputPath(`textarea-360-${scheme}.png`),
      });
    });
  }

  test('screenshots of the dark app theme for design comparison', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    // Light and dark panels keep their own theme when the app is dark.
    expect((await controlStyle(state(panel(page, 'light'), 'error'))).background).toBe(
      TOKENS.light.errorSurface,
    );
    expect((await controlStyle(state(panel(page, 'dark'), 'error'))).background).toBe(
      TOKENS.dark.errorSurface,
    );
    await demo(page).screenshot({ path: test.info().outputPath('textarea-dark-app.png') });
  });
});
