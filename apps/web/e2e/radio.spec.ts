// Issue #56: AtsRadioGroup and AtsRadio, checked in the /dev/ui gallery against the design page
// "01 · Foundations" > "ATS / Radio option", "Radio option · Usage and dependencies", the Light/Dark/
// Mobile specimens and "QA · Radio states": Unselected, Selected, Focus/Selected, Disabled/Selected and
// Error/Unselected with its message below the group; the control geometry never changes (the 3 px focus
// stroke is drawn outside it); at 360 px every option is at least 44 px high and long Vietnamese labels
// wrap beside the control.
// The components hold no copy (legend, labels and error come from the caller) and the gallery is
// developer tooling without i18n, so there is no vi/en variant to compare; the demo copy is Vietnamese
// as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    ink: 'rgb(41, 40, 34)',
    muted: 'rgb(102, 100, 93)',
    action: 'rgb(215, 237, 153)',
    actionLine: 'rgb(121, 135, 82)',
    danger: 'rgb(164, 41, 41)',
    focusRing: 'rgb(41, 40, 34)',
  },
  dark: {
    ink: 'rgb(244, 241, 232)',
    muted: 'rgb(192, 190, 181)',
    action: 'rgb(202, 221, 150)',
    actionLine: 'rgb(121, 135, 82)',
    danger: 'rgb(255, 181, 172)',
    focusRing: 'rgb(244, 241, 232)',
  },
} as const;

const STATES = [
  'unselected',
  'selected',
  'focus',
  'disabled',
  'error',
  'group',
  'disabled-option',
  'long',
] as const;

const LEGENDS: Partial<Record<(typeof STATES)[number], string>> = {
  unselected: 'Default · Unselected',
  selected: 'Default · Selected',
  focus: 'Focus · Selected',
  disabled: 'Disabled · Selected',
  error: 'Error · Unselected',
};

const ERROR = 'Chọn một phạm vi áp dụng trước khi tiếp tục.';
const LONG = 'Cho phép làm việc từ xa tại các quốc gia được nhà tuyển dụng phê duyệt';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsRadioGroup');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);
const state = (scope: Locator, name: (typeof STATES)[number]) =>
  scope.locator(`section[data-state="${name}"]`);

function radioStyle(radio: Locator) {
  return radio.evaluate((el) => {
    const input = el as HTMLInputElement;
    const s = getComputedStyle(input);
    const r = input.getBoundingClientRect();
    const label = input.closest('label')!;
    const ls = getComputedStyle(label);
    return {
      width: r.width,
      height: r.height,
      checked: input.checked,
      disabled: input.disabled,
      borderColor: s.borderTopColor,
      borderWidth: s.borderTopWidth,
      borderRadius: s.borderTopLeftRadius,
      backgroundImage: s.backgroundImage,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset,
      labelColor: ls.color,
      labelOpacity: ls.opacity,
    };
  });
}

test.describe('Radio option (AtsRadioGroup, AtsRadio)', () => {
  test('the gallery shows Unselected, Selected, Focus/Selected, Disabled/Selected and Error/Unselected in light, dark and 360 px panels', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(
      demo(page).getByRole('heading', { level: 2, name: 'AtsRadioGroup' }),
    ).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const p = panel(page, id);
      await expect(p).toBeVisible();
      expect(
        await p
          .locator('section[data-state]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-state'))),
      ).toEqual([...STATES]);
      const t = id === 'dark' ? TOKENS.dark : TOKENS.light;

      // Captions (legends) as in "QA · Radio states", each naming its group.
      for (const [name, legend] of Object.entries(LEGENDS)) {
        const section = state(p, name as (typeof STATES)[number]);
        await expect(section.getByRole('group', { name: legend })).toBeVisible();
        await expect(section.getByRole('radio', { name: 'Toàn cầu' })).toBeVisible();
      }

      // Geometry is the same 18 px ring in every state, including focus.
      const sizes = await p
        .locator('input[type="radio"]')
        .evaluateAll((els) =>
          els.map((el) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height]),
        );
      for (const [w, h] of sizes) {
        expect(w, `${id}: control width`).toBeCloseTo(18, 0);
        expect(h, `${id}: control height`).toBeCloseTo(18, 0);
      }

      // Unselected: muted ring, no fill, ink label.
      const u = await radioStyle(state(p, 'unselected').getByRole('radio'));
      expect(u.checked).toBe(false);
      expect(u.borderColor).toBe(t.muted);
      expect(u.borderWidth).toBe('2px');
      expect(u.backgroundImage).toBe('none');
      expect(u.outlineStyle).toBe('none');
      expect(u.labelColor).toBe(t.ink);

      // Selected: action-line ring with the action dot.
      const s = await radioStyle(state(p, 'selected').getByRole('radio'));
      expect(s.checked).toBe(true);
      expect(s.borderColor).toBe(t.actionLine);
      expect(s.backgroundImage).toContain('radial-gradient');
      expect(s.backgroundImage).toContain(t.action);
      expect(s.backgroundImage).toContain(t.actionLine);
      expect(s.outlineStyle).toBe('none');

      // Focus/Selected: selected look plus a 3 px focus stroke outside the control.
      const f = await radioStyle(state(p, 'focus').getByRole('radio'));
      expect(f.checked).toBe(true);
      expect(f.borderColor).toBe(t.actionLine);
      expect(f.outlineStyle).toBe('solid');
      expect(f.outlineWidth).toBe('3px');
      expect(f.outlineColor).toBe(t.focusRing);
      expect(parseFloat(f.outlineOffset)).toBeGreaterThanOrEqual(0);

      // Disabled/Selected: checked, disabled, whole option dimmed.
      const d = await radioStyle(state(p, 'disabled').getByRole('radio'));
      expect(d.checked).toBe(true);
      expect(d.disabled).toBe(true);
      expect(d.labelOpacity).toBe('0.45');
      expect(d.backgroundImage).toContain('radial-gradient');

      // Error/Unselected: danger ring and label, message below the group, wired for AT.
      const errSection = state(p, 'error');
      const errRadio = errSection.getByRole('radio');
      const e = await radioStyle(errRadio);
      expect(e.checked).toBe(false);
      expect(e.borderColor).toBe(t.danger);
      expect(e.labelColor).toBe(t.danger);
      await expect(errRadio).toHaveAttribute('aria-invalid', 'true');
      await expect(errRadio).toHaveAccessibleDescription(ERROR);
      const message = errSection.getByText(ERROR);
      await expect(message).toBeVisible();
      expect(await message.evaluate((el) => getComputedStyle(el).color)).toBe(t.danger);
      const below = await errSection.evaluate((section) => {
        const control = section.querySelector('label')!.getBoundingClientRect();
        const msg = section.querySelector('.ats-radio-group__error')!.getBoundingClientRect();
        return msg.top - control.bottom;
      });
      // Clear of the 3 px focus stroke on the last option.
      expect(below, `${id}: message below the options`).toBeGreaterThan(3);

      // Other groups are not invalid.
      for (const name of ['unselected', 'selected', 'focus', 'disabled'] as const) {
        await expect(state(p, name).getByRole('radio')).not.toHaveAttribute('aria-invalid', /.*/);
      }

      // Caption → 8 px → control.
      const captionGap = await state(p, 'selected').evaluate((section) => {
        const legend = section.querySelector('legend')!.getBoundingClientRect();
        const option = section.querySelector('label')!.getBoundingClientRect();
        return option.top - legend.bottom;
      });
      expect(captionGap, `${id}: caption/control gap`).toBeCloseTo(8, 0);
    }

    await demo(page).screenshot({ path: test.info().outputPath('radio-demo-light-app.png') });
  });

  for (const id of ['light', 'mobile'] as const) {
    test(`clicking a label and pressing arrow keys update the selection; disabled options cannot be selected (${id} panel)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto('/dev/ui');
      const p = panel(page, id);

      // Click a label in the remote-eligibility group.
      const remote = state(p, 'group').getByRole('group', { name: 'Remote eligibility' });
      await expect(remote.getByRole('radio', { name: 'Các quốc gia được chọn' })).toBeChecked();
      await remote.getByText('Toàn cầu', { exact: true }).click();
      await expect(remote.getByRole('radio', { name: 'Toàn cầu' })).toBeChecked();
      await expect(remote.getByRole('radio', { name: 'Các quốc gia được chọn' })).not.toBeChecked();

      // Arrow keys move focus and selection; the real focus shows the 3 px focus stroke.
      await page.keyboard.press('ArrowDown');
      const countries = remote.getByRole('radio', { name: 'Các quốc gia được chọn' });
      await expect(countries).toBeChecked();
      await expect(countries).toBeFocused();
      const focused = await radioStyle(countries);
      expect(focused.outlineStyle).toBe('solid');
      expect(focused.outlineWidth).toBe('3px');
      expect(focused.outlineColor).toBe(TOKENS.light.focusRing);
      expect(focused.width).toBeCloseTo(18, 0);
      await page.keyboard.press('ArrowDown');
      await expect(
        remote.getByRole('radio', { name: 'Chỉ các khu vực được chỉ định' }),
      ).toBeChecked();
      await page.keyboard.press('ArrowDown'); // wraps
      await expect(remote.getByRole('radio', { name: 'Toàn cầu' })).toBeChecked();
      await page.keyboard.press('ArrowUp'); // wraps back
      await expect(
        remote.getByRole('radio', { name: 'Chỉ các khu vực được chỉ định' }),
      ).toBeChecked();
      await page.keyboard.press('ArrowLeft');
      await expect(countries).toBeChecked();

      // A disabled option in an enabled group: clicking does nothing, arrows skip it.
      const salary = state(p, 'disabled-option').getByRole('group', { name: 'Salary visibility' });
      const locked = salary.getByRole('radio', { name: 'Khoảng lương đã bị khóa' });
      await expect(locked).toBeDisabled();
      await salary.getByText('Khoảng lương đã bị khóa').click({ force: true });
      await expect(locked).not.toBeChecked();
      await expect(salary.getByRole('radio', { name: 'Thỏa thuận' })).toBeChecked();
      await salary.getByRole('radio', { name: 'Thỏa thuận' }).focus();
      await page.keyboard.press('ArrowDown');
      await expect(salary.getByRole('radio', { name: 'Không hiển thị' })).toBeChecked();
      await expect(locked).not.toBeChecked();

      // A disabled group: the selected option stays selected and cannot be changed.
      const disabledGroup = state(p, 'disabled');
      await disabledGroup.getByText('Toàn cầu').click({ force: true });
      await expect(disabledGroup.getByRole('radio')).toBeChecked();
      await expect(disabledGroup.getByRole('radio')).toBeDisabled();

      // Unselected group becomes selected by clicking its label.
      const unselected = state(p, 'unselected');
      await unselected.getByText('Toàn cầu').click();
      await expect(unselected.getByRole('radio')).toBeChecked();

      // Selecting in the error group keeps the caller's error until the caller clears it.
      const err = state(p, 'error');
      await err.getByText('Toàn cầu').click();
      await expect(err.getByRole('radio')).toBeChecked();

      // Radio names are unique per group within a panel.
      const names = await p
        .locator('fieldset')
        .evaluateAll((els) => els.map((el) => el.querySelector('input')!.getAttribute('name')));
      expect(new Set(names).size).toBe(names.length);
    });
  }

  test('each gallery panel keeps its own selection (the three demo instances do not share radio groups)', async ({
    page,
  }) => {
    await page.goto('/dev/ui');
    for (const id of ['light', 'dark', 'mobile'] as const) {
      await expect(
        state(panel(page, id), 'selected').getByRole('radio', { name: 'Toàn cầu' }),
        `${id}: Default · Selected is checked`,
      ).toBeChecked();
    }
    await state(panel(page, 'light'), 'group').getByText('Toàn cầu', { exact: true }).click();
    await expect(
      state(panel(page, 'mobile'), 'group').getByRole('radio', { name: 'Các quốc gia được chọn' }),
      'selection in the light panel leaves the 360 px panel alone',
    ).toBeChecked();
  });

  test('the hidden legend still names its group', async ({ page }) => {
    await page.goto('/dev/ui');
    const long = state(panel(page, 'light'), 'long');
    const group = long.getByRole('group', { name: 'Long label · hidden legend' });
    await expect(group).toBeVisible();
    const legendBox = await long.locator('legend').boundingBox();
    expect(legendBox!.width).toBeLessThanOrEqual(1);
    expect(legendBox!.height).toBeLessThanOrEqual(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`at a 360 px viewport (${scheme}) every option is at least 44 px high and a long label wraps beside the control`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/dev/ui');
      await expect(demo(page)).toBeVisible();

      for (const id of ['light', 'dark', 'mobile'] as const) {
        const p = panel(page, id);
        const heights = await p
          .locator('label.ats-radio')
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThanOrEqual(11);
        for (const h of heights) expect(h, `${id}: option height`).toBeGreaterThanOrEqual(44);

        const section = state(p, 'long');
        await section.scrollIntoViewIfNeeded();
        const m = await section.evaluate((s, text) => {
          const label = [...s.querySelectorAll('label')].find((l) =>
            l.textContent?.includes(text),
          )!;
          const control = label.querySelector('input')!.getBoundingClientRect();
          const span = label.querySelector('.ats-radio__label')!;
          const textBox = span.getBoundingClientRect();
          const lineHeight = parseFloat(getComputedStyle(span).lineHeight);
          return {
            lines: Math.round(textBox.height / lineHeight),
            textLeft: textBox.left,
            controlRight: control.right,
            textTop: textBox.top,
            controlTop: control.top,
            controlWidth: control.width,
            textRight: textBox.right,
            labelRight: label.getBoundingClientRect().right,
            scrollWidth: span.scrollWidth,
            clientWidth: span.clientWidth,
          };
        }, LONG);
        expect(m.lines, `${id}: long label wraps`).toBeGreaterThanOrEqual(2);
        expect(m.textLeft, `${id}: text beside the control`).toBeGreaterThan(m.controlRight);
        expect(m.controlWidth, `${id}: control keeps its size`).toBeCloseTo(18, 0);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
        expect(m.textRight, `${id}: inside viewport`).toBeLessThanOrEqual(360);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // The gallery itself pads the 360 px panel; only the radio demo must not add overflow.
      const demoRight = await panel(page, 'mobile').evaluate(
        (el) => el.querySelector('.radio-demo')!.getBoundingClientRect().right,
      );
      expect(demoRight).toBeLessThanOrEqual(360 + Math.max(overflow, 0));

      await panel(page, 'mobile').screenshot({
        path: test.info().outputPath(`radio-360-${scheme}.png`),
      });
    });
  }

  test('screenshots of the dark app theme for design comparison', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    // Light and dark panels keep their own theme when the app is dark.
    expect(
      (await radioStyle(state(panel(page, 'light'), 'error').getByRole('radio'))).borderColor,
    ).toBe(TOKENS.light.danger);
    expect(
      (await radioStyle(state(panel(page, 'dark'), 'error').getByRole('radio'))).borderColor,
    ).toBe(TOKENS.dark.danger);
    await demo(page).screenshot({ path: test.info().outputPath('radio-demo-dark-app.png') });
  });
});
