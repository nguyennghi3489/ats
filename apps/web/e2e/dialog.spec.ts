// Issue #62: AtsDialog, checked in the /dev/ui gallery and as a live modal against the design page
// "01 · Foundations" > "ATS/Dialog", the Light / Dark / Mobile 360 "Archive" specimens and
// "QA · Dialog assembled spacing": desktop width 520 with an outer inset of 24, mobile width 328 with
// an inset of 20, header gap 12, section gap 16, footer top inset 8, action gap 8, content hugging
// vertically, and on mobile the actions stacked full width with the primary action last.
// The component holds no copy (the caller passes translated title, close label and actions) and the
// gallery is developer tooling without i18n, so there is no vi/en variant; the demo copy is Vietnamese
// as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: { surface: 'rgb(255, 255, 255)', line: 'rgb(177, 175, 165)', ink: 'rgb(41, 40, 34)' },
  dark: { surface: 'rgb(42, 43, 39)', line: 'rgb(118, 119, 108)', ink: 'rgb(244, 241, 232)' },
} as const;

const TITLE = 'Lưu trữ hồ sơ ứng viên?';
const BODY =
  'Hồ sơ sẽ được đưa ra khỏi danh sách làm việc mặc định. Các lượt ứng tuyển hiện có không thay đổi và bạn có thể khôi phục hồ sơ sau.';
const SHOTS = 'test-results/dialog';

// The inline gallery specimens are <dialog open> too, so the live modal is picked by :modal and its
// role and accessible name are asserted separately.
const modal = (page: Page) => page.locator('dialog:modal');

const demo = (page: Page) => page.getByTestId('ui-demo-AtsDialog');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);

/** Geometry of an AtsDialog, relative to its own box. */
function measure(dialog: Locator) {
  return dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const frame = el.querySelector('.ats-dialog__frame')!;
    const header = el.querySelector('.ats-dialog__header')!.getBoundingClientRect();
    const title = el.querySelector('.ats-dialog__title')!.getBoundingClientRect();
    const close = el.querySelector('.ats-dialog__close')!.getBoundingClientRect();
    const body = el.querySelector('.ats-dialog__body')!.getBoundingClientRect();
    const footer = el.querySelector('.ats-dialog__footer')!;
    const fr = footer.getBoundingClientRect();
    const actions = [...footer.children].map((a) => {
      const b = a.getBoundingClientRect();
      return { text: (a as HTMLElement).innerText.trim(), x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      padding: getComputedStyle(frame).padding,
      background: s.backgroundColor,
      border: [s.borderTopWidth, s.borderTopStyle, s.borderTopColor],
      color: s.color,
      titleToClose: Math.round(close.left - title.right),
      headerTop: Math.round(header.top - r.top),
      headerToBody: Math.round(body.top - header.bottom),
      bodyToFooter: Math.round(fr.top - body.bottom),
      footerPaddingTop: getComputedStyle(footer).paddingTop,
      footerBottomInset: Math.round(r.bottom - fr.bottom),
      footerLeftInset: Math.round(fr.left - r.left),
      footerWidth: fr.width,
      closeSize: [close.width, close.height],
      actions,
    };
  });
}

test.describe('Dialog (AtsDialog)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('desktop gallery: light and dark specimens match "QA · Dialog assembled spacing"', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsDialog' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      const dialog = p.getByTestId('dialog-specimen');
      await dialog.scrollIntoViewIfNeeded();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(TITLE);
      await expect(dialog.getByRole('button', { name: 'Đóng' })).toBeVisible();
      await expect(dialog.locator('.ats-dialog__body')).toHaveText(BODY);

      const m = await measure(dialog);
      const label = `${id} specimen`;
      expect(m.width, `${label}: 520 wide`).toBe(520);
      expect(m.padding, `${label}: outer inset 24`).toBe('24px');
      expect(m.headerTop, `${label}: header 24 from the top edge (+1 border)`).toBe(25);
      expect(m.titleToClose, `${label}: header gap >= 12`).toBeGreaterThanOrEqual(12);
      expect(m.headerToBody, `${label}: section gap 16`).toBe(16);
      expect(m.footerPaddingTop, `${label}: footer top inset 8`).toBe('8px');
      expect(m.bodyToFooter, `${label}: section gap 16 before the footer`).toBe(16);
      expect(m.footerBottomInset, `${label}: hugs, inset 24 below the actions`).toBe(25);
      expect(m.footerLeftInset, `${label}: actions start at the inset`).toBe(25);
      expect(m.background, `${label}: surface`).toBe(TOKENS[id].surface);
      expect(m.border, `${label}: 1 px line`).toEqual(['1px', 'solid', TOKENS[id].line]);
      expect(m.color, `${label}: ink`).toBe(TOKENS[id].ink);

      // Actions side by side, left aligned, gap 8, primary last.
      expect(m.actions.map((a) => a.text)).toEqual(['Hủy', 'Lưu trữ hồ sơ']);
      const [cancel, primary] = m.actions;
      expect(cancel!.y, `${label}: actions on one row`).toBe(primary!.y);
      expect(Math.round(primary!.x - (cancel!.x + cancel!.w)), `${label}: action gap 8`).toBe(8);
      expect(cancel!.w, `${label}: action width`).toBeGreaterThanOrEqual(160);

      await dialog.screenshot({ path: `${SHOTS}/specimen-${id}.png` });
    }
  });

  test('360 px gallery panel: specimen stacks full-width actions with a 20 px inset', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/dev/ui');
    const dialog = panel(page, 'mobile').getByTestId('dialog-specimen');
    await dialog.scrollIntoViewIfNeeded();
    await expect(dialog).toBeVisible();

    const m = await measure(dialog);
    // The panel is 360 wide with a 16 px inset and a 1 px border; the design frame is 328.
    expect(m.width).toBeGreaterThanOrEqual(326);
    expect(m.width).toBeLessThanOrEqual(328);
    expect(m.padding, 'inset 20').toBe('20px');
    expect(m.headerToBody, 'section gap 16').toBe(16);
    expect(m.footerBottomInset, 'hugs, inset 20 below the actions').toBe(21);
    expect(m.closeSize, 'close button is a 44 px touch target').toEqual([44, 44]);
    expect(m.actions.map((a) => a.text)).toEqual(['Hủy', 'Lưu trữ hồ sơ']);
    const [cancel, primary] = m.actions;
    expect(primary!.y, 'primary stacked below cancel').toBeGreaterThan(cancel!.y);
    expect(Math.round(primary!.y - (cancel!.y + cancel!.h)), 'action gap 8').toBe(8);
    for (const a of m.actions) {
      expect(a.w, `${a.text}: full width`).toBe(m.footerWidth);
      expect(a.h, `${a.text}: 44 px tall`).toBeGreaterThanOrEqual(44);
    }
    await dialog.screenshot({ path: `${SHOTS}/specimen-mobile-panel.png` });
  });

  test('live modal: role, name, description, focus trap, Escape, close button and backdrop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dev/ui');
    const opener = panel(page, 'light').getByTestId('dialog-open-archive');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();

    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveRole('dialog');
    await expect(dialog).toHaveAccessibleName(TITLE);
    await expect(dialog).toHaveAccessibleDescription(BODY);

    // Centred in the viewport, 520 wide with the 24 px inset.
    const m = await measure(dialog);
    expect(m.width).toBe(520);
    expect(m.padding).toBe('24px');
    expect(Math.abs(m.left - (1440 - m.right))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/live-desktop-light.png` });

    // The page behind is inert: the opener can not be hit while the dialog is open.
    const behind = await page.evaluate(() => {
      const el = document.elementFromPoint(5, 5);
      return el?.closest('dialog') !== null || el?.tagName === 'DIALOG';
    });
    expect(behind, 'a point outside the dialog hits the dialog backdrop').toBe(true);

    // Focus starts on the first footer action (the body has nothing focusable).
    const cancel = dialog.getByRole('button', { name: 'Hủy' });
    const primary = dialog.getByRole('button', { name: 'Lưu trữ hồ sơ' });
    const close = dialog.getByRole('button', { name: 'Đóng' });
    await expect(cancel).toBeFocused();

    // Tab and Shift+Tab cycle only inside the dialog.
    await page.keyboard.press('Tab');
    await expect(primary).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(primary).toBeFocused();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    // A backdrop click does not close it.
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    // Escape closes it and focus returns to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // The close button closes it and focus returns to the opener.
    await opener.click();
    await expect(dialog).toBeVisible();
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // Hủy closes it too.
    await opener.click();
    await cancel.click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('live modal: while the action is pending, Escape and the close button do not close it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    const opener = p.getByTestId('dialog-open-archive');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();

    const dialog = modal(page);
    await dialog.getByRole('button', { name: 'Lưu trữ hồ sơ' }).click();
    const close = dialog.getByRole('button', { name: 'Đóng' });
    await expect(close).toBeDisabled();
    await page.keyboard.press('Escape');
    await close.click({ force: true });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/live-pending.png` });

    // When the action finishes, the caller closes it.
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(p.getByText('Last action: Đã lưu trữ')).toBeVisible();
    await expect(opener).toBeFocused();
  });

  test('360 px viewport: live modal is min(328, 100vw - 32) wide with stacked actions, primary last', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    const opener = panel(page, 'light').getByTestId('dialog-open-archive');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    const dialog = modal(page);
    await expect(dialog).toBeVisible();

    const m = await measure(dialog);
    expect(m.width).toBe(328);
    expect(m.left).toBeGreaterThanOrEqual(16);
    expect(m.right).toBeLessThanOrEqual(344);
    expect(m.padding).toBe('20px');
    expect(m.actions.map((a) => a.text)).toEqual(['Hủy', 'Lưu trữ hồ sơ']);
    const [cancel, primary] = m.actions;
    expect(primary!.y).toBeGreaterThan(cancel!.y);
    for (const a of m.actions) {
      expect(a.w, `${a.text}: full width`).toBe(m.footerWidth);
      expect(a.h, `${a.text}: 44 px tall`).toBeGreaterThanOrEqual(44);
    }
    expect(m.footerBottomInset, 'hugs, inset 20 below the actions').toBe(21);
    await page.screenshot({ path: `${SHOTS}/live-360.png` });
  });

  for (const viewport of [
    { width: 1440, height: 700 },
    { width: 360, height: 640 },
  ]) {
    test(`${viewport.width} px: a long body scrolls inside the dialog, footer reachable, page locked`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev/ui');
      const opener = panel(page, 'light').getByTestId('dialog-open-long');
      await opener.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await opener.click();

      const dialog = modal(page);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleName('Điều khoản xử lý dữ liệu');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
        'hidden',
      );

      const box = (await dialog.boundingBox())!;
      expect(box.y, 'dialog top inside the viewport').toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, 'dialog bottom inside the viewport').toBeLessThanOrEqual(
        viewport.height,
      );

      const body = dialog.locator('.ats-dialog__body');
      const sizes = await body.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
      expect(sizes.sh, 'the body overflows').toBeGreaterThan(sizes.ch);

      // Wheel over the body scrolls the body, not the page.
      const b = (await body.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.wheel(0, 600);
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      // Wheel over the backdrop does not scroll the page either.
      await page.mouse.move(2, 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      // The footer is in view and its actions work.
      const agree = dialog.getByRole('button', { name: 'Đồng ý' });
      await expect(agree).toBeInViewport();
      await page.screenshot({ path: `${SHOTS}/long-${viewport.width}.png` });
      await agree.click();
      await expect(dialog).toBeHidden();
      await expect(panel(page, 'light').getByText('Last action: Đã đồng ý')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
      await expect(opener).toBeFocused();
    });
  }
});
