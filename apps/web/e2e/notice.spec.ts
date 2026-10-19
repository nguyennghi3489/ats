// Issue #58: AtsNotice, checked in the /dev/ui gallery against the design page "01 · Foundations"
// > "QA · Notice spacing" and the Light / Dark / Mobile 360 notice specimens.
// Inset 12 / 16, icon/copy gap 12, title/message gap 4, 16 px decorative icon per tone, role alert for
// error and status for info/success, tone colours from tokens in light and dark (dark: info keeps a
// fill, success and error sit on the surface colour), long Vietnamese text wraps fully at 360 px.
// The component holds no copy (text comes from the caller) and the gallery is developer tooling
// without i18n, so there is no vi/en variant; demo copy is Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    info: { fill: 'rgb(231, 225, 251)', text: 'rgb(41, 40, 34)', icon: 'rgb(41, 40, 34)' },
    success: { fill: 'rgb(228, 240, 211)', text: 'rgb(41, 40, 34)', icon: 'rgb(121, 135, 82)' },
    error: { fill: 'rgb(248, 226, 223)', text: 'rgb(164, 41, 41)', icon: 'rgb(164, 41, 41)' },
  },
  dark: {
    info: { fill: 'rgb(73, 66, 82)', text: 'rgb(244, 241, 232)', icon: 'rgb(244, 241, 232)' },
    // Success and error are text-coloured on the page surface (--color-surface #2a2b27).
    success: { fill: 'rgb(42, 43, 39)', text: 'rgb(244, 241, 232)', icon: 'rgb(202, 221, 150)' },
    error: { fill: 'rgb(42, 43, 39)', text: 'rgb(255, 181, 172)', icon: 'rgb(255, 181, 172)' },
  },
} as const;

const TONES = [
  { tone: 'info', role: 'status', title: 'Thông tin' },
  { tone: 'success', role: 'status', title: 'Đã hoàn tất' },
  { tone: 'error', role: 'alert', title: 'Cần xử lý' },
] as const;

const demo = (page: Page) => page.getByTestId('ui-demo-AtsNotice');
const panel = (page: Page, id: 'light' | 'dark' | 'mobile') =>
  demo(page).locator(`[data-panel="${id}"]`);

function noticeBox(notice: Locator) {
  return notice.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const icon = el.querySelector('svg')!;
    const ir = icon.getBoundingClientRect();
    const copy = el.querySelector('.ats-notice__copy')!;
    const cr = copy.getBoundingClientRect();
    const title = el.querySelector('.ats-notice__title');
    const message = el.querySelector('.ats-notice__message')!;
    const mr = message.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    return {
      paddingTop: s.paddingTop,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      paddingRight: s.paddingRight,
      fill: s.backgroundColor,
      text: getComputedStyle(message).color,
      titleColor: title ? getComputedStyle(title).color : null,
      titleWeight: title ? Number(getComputedStyle(title).fontWeight) : null,
      icon: {
        width: ir.width,
        height: ir.height,
        color: getComputedStyle(icon).color,
        ariaHidden: icon.getAttribute('aria-hidden'),
        paths: [...icon.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|'),
      },
      // Measured from the box edges, so it covers inset and icon/copy gap together.
      iconLeftInset: ir.left - r.left,
      copyTopInset: cr.top - r.top,
      copyBottomInset: r.bottom - cr.bottom,
      iconToCopy: cr.left - ir.right,
      titleToMessage: tr ? mr.top - tr.bottom : null,
      hasTitle: Boolean(title),
      messageLineCount: Math.round(mr.height / parseFloat(getComputedStyle(message).lineHeight)),
      overflowX: el.scrollWidth - el.clientWidth,
      messageOverflowX: message.scrollWidth - message.clientWidth,
      messageOverflowY: message.scrollHeight - message.clientHeight,
      right: r.right,
    };
  });
}

test.describe('Notice (AtsNotice)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('the gallery shows info, success and error in light and dark with the "QA · Notice spacing" geometry', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();
    await expect(demo(page).getByRole('heading', { level: 2, name: 'AtsNotice' })).toBeVisible();

    for (const id of ['light', 'dark'] as const) {
      const p = panel(page, id);
      const iconPaths = new Set<string>();
      for (const { tone, role, title } of TONES) {
        const n = p.getByTestId(`notice-${tone}`);
        await expect(n, `${id}: ${tone}`).toBeVisible();
        await expect(n).toHaveAttribute('role', role);
        await expect(n.locator('.ats-notice__title')).toHaveText(title);

        const b = await noticeBox(n);
        expect([b.paddingTop, b.paddingBottom], `${id} ${tone}: block inset`).toEqual([
          '12px',
          '12px',
        ]);
        expect([b.paddingLeft, b.paddingRight], `${id} ${tone}: inline inset`).toEqual([
          '16px',
          '16px',
        ]);
        expect(b.iconLeftInset, `${id} ${tone}: icon inset`).toBe(16);
        expect(b.copyTopInset).toBe(12);
        expect(b.copyBottomInset).toBe(12);
        expect(b.iconToCopy, `${id} ${tone}: icon/copy gap`).toBe(12);
        expect(b.titleToMessage, `${id} ${tone}: title/message gap`).toBe(4);
        expect(b.titleWeight).toBeGreaterThanOrEqual(700);
        expect([b.icon.width, b.icon.height], `${id} ${tone}: icon size`).toEqual([16, 16]);
        expect(b.icon.ariaHidden).toBe('true');
        iconPaths.add(b.icon.paths);

        const t = TOKENS[id][tone];
        expect(b.fill, `${id} ${tone}: fill`).toBe(t.fill);
        expect(b.text, `${id} ${tone}: text`).toBe(t.text);
        expect(b.titleColor, `${id} ${tone}: title`).toBe(t.text);
        expect(b.icon.color, `${id} ${tone}: icon`).toBe(t.icon);
      }
      expect(iconPaths.size, `${id}: one distinct icon per tone`).toBe(3);
    }

    await demo(page).screenshot({ path: test.info().outputPath('notice-gallery-desktop.png') });
  });

  test('without a title only the message renders and the spacing stays correct', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    for (const id of ['light', 'dark', 'mobile'] as const) {
      const n = panel(page, id).getByTestId('notice-untitled');
      await expect(n).toBeVisible();
      await expect(n).toHaveText('Đã lưu thay đổi và cập nhật nội dung hiển thị.');
      const b = await noticeBox(n);
      expect(b.hasTitle, `${id}: no title element`).toBe(false);
      expect(b.titleToMessage).toBeNull();
      expect([b.paddingTop, b.paddingRight, b.paddingBottom, b.paddingLeft]).toEqual([
        '12px',
        '16px',
        '12px',
        '16px',
      ]);
      expect(b.copyTopInset).toBe(12);
      expect(b.copyBottomInset).toBe(12);
      expect(b.iconToCopy).toBe(12);
      expect([b.icon.width, b.icon.height]).toEqual([16, 16]);
      expect(b.icon.ariaHidden).toBe('true');
    }
  });

  test('a long Vietnamese message wraps fully in the 360 px panel, with no clipping or horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const p = panel(page, 'mobile');
    expect((await p.boundingBox())!.width).toBe(360);

    // The three tones and the long notice all fit the 360 px panel.
    const panelRight = await p.evaluate((el) => el.getBoundingClientRect().right);
    for (const testId of ['notice-info', 'notice-success', 'notice-error', 'notice-long']) {
      const b = await noticeBox(p.getByTestId(testId));
      expect(b.overflowX, `${testId}: no horizontal overflow`).toBeLessThanOrEqual(0);
      expect(b.messageOverflowX, `${testId}: message not clipped horizontally`).toBeLessThanOrEqual(
        0,
      );
      expect(b.messageOverflowY, `${testId}: message not clipped vertically`).toBeLessThanOrEqual(
        0,
      );
      expect(b.right, `${testId}: inside the panel`).toBeLessThanOrEqual(panelRight);
    }

    const long = p.getByTestId('notice-long');
    await expect(long.locator('.ats-notice__title')).toHaveText('Thông tin dài');
    await expect(long).toContainText('kể cả khi nội dung kéo dài nhiều dòng.');
    const b = await noticeBox(long);
    expect(b.messageLineCount, 'long message wraps to several lines').toBeGreaterThanOrEqual(3);
    // The last word is really on screen, not cut by the frame (the design's light specimen bug).
    const lastWord = await long.evaluate((el) => {
      const message = el.querySelector('.ats-notice__message')!;
      const range = document.createRange();
      range.selectNodeContents(message);
      const rects = [...range.getClientRects()];
      const r = el.getBoundingClientRect();
      return rects.every((x) => x.right <= r.right - 16 + 0.5 && x.left >= r.left);
    });
    expect(lastWord, 'every text line stays inside the 16 px inline inset').toBe(true);

    await p.screenshot({ path: test.info().outputPath('notice-gallery-360-panel.png') });
  });

  test('at a 360 px viewport the notices wrap and the page has no horizontal scroll from them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    const d = demo(page);
    await expect(d).toBeVisible();
    for (const id of ['light', 'dark', 'mobile'] as const) {
      for (const testId of [
        'notice-info',
        'notice-success',
        'notice-error',
        'notice-untitled',
        'notice-long',
      ]) {
        const n = panel(page, id).getByTestId(testId);
        const b = await noticeBox(n);
        expect(b.overflowX, `${id} ${testId}: no horizontal overflow`).toBeLessThanOrEqual(0);
        expect(b.messageOverflowY, `${id} ${testId}: not clipped`).toBeLessThanOrEqual(0);
      }
      // Each light/dark notice fits the viewport width.
      if (id !== 'mobile') {
        const right = await panel(page, id)
          .getByTestId('notice-long')
          .evaluate((el) => el.getBoundingClientRect().right);
        expect(right, `${id}: long notice within the 360 px viewport`).toBeLessThanOrEqual(360);
      }
    }
    await d.scrollIntoViewIfNeeded();
    await d.screenshot({ path: test.info().outputPath('notice-gallery-viewport-360.png') });
  });

  test('an error notice is an alert, info and success are status messages, icons are hidden', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    const p = panel(page, 'light');
    await expect(p.getByRole('alert')).toHaveCount(1);
    await expect(p.getByRole('alert')).toContainText('Không thể lưu thay đổi.');
    await expect(p.getByRole('status')).toHaveCount(4);
    await expect(p.locator('[data-testid^="notice-"] svg:not([aria-hidden="true"])')).toHaveCount(
      0,
    );
  });
});
