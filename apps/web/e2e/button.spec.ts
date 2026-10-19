// Issue #42: AtsButton (design page "01 · Foundations", ATS / Button and QA · Button states).
// Checks the /dev/ui demo in the browser: Primary and Outline in every state against the light and dark
// specimens, the 3 px focus ring drawn inside an unchanged box, the 44 px wrapping mobile layout, and
// pending / disabled behaviour with a real pointer and keyboard. The labels are the caller's (the demo
// passes Vietnamese text); the component holds no copy, so there is no en variant to compare.
import { expect, test, type Locator, type Page } from '@playwright/test';

const STATES = ['default', 'hover', 'focus', 'disabled', 'pressed', 'pending'] as const;
const VARIANTS = ['primary', 'outline'] as const;

// Values of src/styles/tokens.css as the browser reports them.
const TOKENS = {
  light: {
    action: 'rgb(215, 237, 153)',
    actionLine: 'rgb(121, 135, 82)',
    control: 'rgb(255, 255, 255)',
    accent: 'rgb(231, 225, 251)',
    line: 'rgb(177, 175, 165)',
    ink: 'rgb(41, 40, 34)',
    actionInk: 'rgb(41, 40, 34)',
    focus: 'rgb(41, 40, 34)',
  },
  dark: {
    action: 'rgb(202, 221, 150)',
    actionLine: 'rgb(121, 135, 82)',
    control: 'rgb(50, 51, 46)',
    accent: 'rgb(73, 66, 82)',
    line: 'rgb(118, 119, 108)',
    ink: 'rgb(244, 241, 232)',
    actionInk: 'rgb(41, 40, 34)',
    focus: 'rgb(244, 241, 232)',
  },
} as const;

const LONG_LABEL = 'Lưu thay đổi có nội dung dài';

type Look = {
  background: string;
  border: string;
  color: string;
  opacity: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  height: number;
};

const look = (button: Locator): Promise<Look> =>
  button.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      border: s.borderTopColor,
      color: s.color,
      opacity: s.opacity,
      outlineStyle: s.outlineStyle,
      outlineWidth: s.outlineWidth,
      outlineOffset: s.outlineOffset,
      height: el.getBoundingClientRect().height,
    };
  });

const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  page.getByTestId('ui-demo-AtsButton').locator(`[data-panel="${id}"]`);

async function openGallery(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/dev/ui');
  await expect(page.getByTestId('ui-demo-AtsButton')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test.describe('AtsButton', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} panel shows Primary and Outline in all six states as in the ${theme} specimen`, async ({
      page,
    }) => {
      await openGallery(page);
      const box = panel(page, theme);
      await expect(box).toHaveAttribute('data-theme', theme);
      const t = TOKENS[theme];

      for (const variant of VARIANTS) {
        for (const state of STATES) {
          const button = box.getByTestId(`button-${variant}-${state}`);
          await expect(button, `${variant} · ${state}`).toBeVisible();
          await expect(button).toHaveText('Lưu thay đổi');
          await expect(box.getByText(`${variant} · ${state}`, { exact: false })).toHaveCount(1);
          const l = await look(button);
          expect(l.height, `${variant} · ${state} is 36 px high on desktop`).toBe(36);

          const rest =
            variant === 'primary'
              ? { background: t.action, border: t.actionLine, color: t.actionInk }
              : { background: t.control, border: t.line, color: t.ink };

          if (state === 'hover') {
            expect(l).toMatchObject({ background: t.accent, border: t.line, color: t.ink });
          } else if (state === 'pressed') {
            expect(l).toMatchObject({ background: t.accent, border: t.actionLine, color: t.ink });
          } else {
            expect(l, `${variant} · ${state} colours`).toMatchObject(rest);
          }

          if (state === 'focus') {
            expect(l).toMatchObject({
              outlineStyle: 'solid',
              outlineWidth: '3px',
              outlineOffset: '-3px',
            });
            expect(await button.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(t.focus);
          } else {
            expect(l.outlineStyle, `${variant} · ${state} has no ring`).toBe('none');
          }

          expect(l.opacity, `${variant} · ${state} opacity`).toBe(
            state === 'disabled' ? '0.45' : '1',
          );
          if (state === 'disabled') await expect(button).toBeDisabled();

          if (state === 'pending') {
            await expect(button).toHaveAttribute('aria-busy', 'true');
            const spinner = button.locator('svg.ats-icon--spin');
            await expect(spinner).toBeVisible();
            // Spinner before the label (first child), 8 px gap. The spinner rotates, so its box is not
            // used to measure the gap.
            expect(await button.evaluate((el) => el.firstElementChild?.tagName.toLowerCase())).toBe(
              'svg',
            );
            expect(await button.evaluate((el) => getComputedStyle(el).columnGap)).toBe('8px');
          } else {
            await expect(button).not.toHaveAttribute('aria-busy', /.*/);
            await expect(button.locator('svg')).toHaveCount(0);
          }
        }
      }

      await box.screenshot({ path: test.info().outputPath(`button-${theme}.png`) });
    });
  }

  test('real hover and press change the look; pending and disabled stay as they are', async ({
    page,
  }) => {
    await openGallery(page);
    const box = panel(page, 'light');
    const t = TOKENS.light;

    for (const variant of VARIANTS) {
      const button = box.getByTestId(`button-${variant}-default`);
      await button.hover();
      expect(await look(button)).toMatchObject({ background: t.accent, border: t.line });
      await page.mouse.down();
      expect(await look(button)).toMatchObject({ background: t.accent, border: t.actionLine });
      await page.mouse.up();
    }

    const pending = box.getByTestId('button-primary-pending');
    await pending.hover();
    expect((await look(pending)).background).toBe(t.action);
    expect(await pending.evaluate((el) => getComputedStyle(el).cursor)).toBe('progress');
  });

  test('Tab shows the 3 px ring inside the button and its outer size does not change', async ({
    page,
  }) => {
    await openGallery(page);
    const box = panel(page, 'light');

    for (const variant of VARIANTS) {
      const button = box.getByTestId(`button-${variant}-default`);
      // boundingBox() is viewport-relative: bring the button into view first so the caption
      // click below does not scroll the page between the two measurements.
      await button.scrollIntoViewIfNeeded();
      const before = await button.boundingBox();
      expect((await look(button)).outlineStyle).toBe('none');

      // Click the caption just before the button (not focusable), then Tab onto the button.
      await box.getByText(`${variant} · Default`).click();
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);

      const l = await look(button);
      expect(l).toMatchObject({
        outlineStyle: 'solid',
        outlineWidth: '3px',
        outlineOffset: '-3px',
      });
      expect(await button.boundingBox(), `${variant} keeps its box when focused`).toEqual(before);
      await button.screenshot({ path: test.info().outputPath(`button-${variant}-tab-focus.png`) });
    }
  });

  test('pending keeps focus and swallows clicks; disabled takes no focus on click', async ({
    page,
  }) => {
    await openGallery(page);
    const box = panel(page, 'light');

    const pending = box.getByTestId('button-primary-pending');
    await pending.click();
    await pending.click();
    await expect(pending).toBeFocused();
    await expect(pending).toBeEnabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');

    const disabled = box.getByTestId('button-primary-disabled');
    await disabled.click({ force: true });
    await expect(disabled).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).not.toBe(
      'button-primary-disabled',
    );
  });

  test.describe('at 360 px', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test('buttons are at least 44 px high and the long label wraps centred without overflow', async ({
      page,
    }) => {
      await openGallery(page);
      const box = panel(page, 'mobile');

      for (const variant of VARIANTS) {
        for (const state of STATES) {
          const l = await look(box.getByTestId(`button-${variant}-${state}`));
          expect(l.height, `${variant} · ${state} meets the touch target`).toBeGreaterThanOrEqual(
            44,
          );
        }
      }

      for (const id of ['button-long', 'button-long-outline', 'button-long-pending']) {
        const button = box.getByTestId(id);
        await expect(button).toBeVisible();
        const b = (await button.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        const panelBox = (await box.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(panelBox.x);
        expect(b.x + b.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
        expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await expect(box.getByTestId('button-long')).toHaveText(LONG_LABEL);

      // Narrow the long button so the label must break, as on the narrow mobile specimen.
      const long = box.getByTestId('button-long');
      await long.evaluate((el) => {
        (el as HTMLElement).style.width = '160px';
      });
      const result = await long.evaluate((el) => {
        const label = el.querySelector('.ats-button__label')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = [...range.getClientRects()];
        const tops = [...new Set(lines.map((r) => Math.round(r.top)))];
        const btn = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const inner = {
          left: btn.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
          right: btn.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
        };
        return {
          lineCount: tops.length,
          // Each line's free space left and right of it, inside the content box.
          slack: tops.map((top) => {
            const onLine = lines.filter((r) => Math.round(r.top) === top);
            const left = Math.min(...onLine.map((r) => r.left));
            const right = Math.max(...onLine.map((r) => r.right));
            return { left: left - inner.left, right: inner.right - right };
          }),
          overflow: el.scrollWidth > el.clientWidth || label.scrollWidth > label.clientWidth,
          textAlign: getComputedStyle(label).textAlign,
          height: btn.height,
        };
      });
      expect(result.lineCount, 'long label wraps').toBeGreaterThan(1);
      expect(result.overflow).toBe(false);
      expect(result.textAlign).toBe('center');
      for (const s of result.slack) {
        expect(s.left).toBeGreaterThanOrEqual(-0.5);
        expect(s.right).toBeGreaterThanOrEqual(-0.5);
        expect(Math.abs(s.left - s.right), 'each line is centred').toBeLessThanOrEqual(1.5);
      }
      expect(result.height).toBeGreaterThanOrEqual(44);
      await long.screenshot({ path: test.info().outputPath('button-long-wrapped-360.png') });
      await box.screenshot({ path: test.info().outputPath('button-mobile-360.png') });
    });
  });
});
