// Issue #60: AtsEmptyState, checked in the /dev/ui gallery against the design page "01 · Foundations"
// > "ATS/Empty state", the Light / Dark / Mobile 360 specimens and "QA · Empty state spacing".
// Inset 28/48 on desktop and 28/20 below the mobile breakpoint, 12 px vertical gap, a 64 px icon surface
// in the accent fill, a centred heading, muted description and the linked (primary) Button action.
// The component holds no copy (the caller passes translated text) and the gallery is developer tooling
// without i18n, so there is no vi/en variant; demo copy is Vietnamese as in the design.
import { expect, test, type Locator, type Page } from '@playwright/test';

// Values from src/styles/tokens.css, as the browser reports them.
const TOKENS = {
  light: {
    surface: 'rgb(255, 255, 255)',
    accent: 'rgb(231, 225, 251)',
    ink: 'rgb(41, 40, 34)',
    muted: 'rgb(102, 100, 93)',
    action: 'rgb(215, 237, 153)',
    actionLine: 'rgb(121, 135, 82)',
  },
  dark: {
    surface: 'rgb(42, 43, 39)',
    accent: 'rgb(73, 66, 82)',
    ink: 'rgb(244, 241, 232)',
    muted: 'rgb(192, 190, 181)',
    action: 'rgb(202, 221, 150)',
    actionLine: 'rgb(121, 135, 82)',
  },
} as const;

const STATES = {
  action: {
    title: 'Không có kết quả phù hợp',
    description: 'Thử thay đổi từ khóa hoặc bộ lọc để tìm nội dung phù hợp.',
    action: 'Xóa bộ lọc',
  },
  'no-action': {
    title: 'Chưa có ứng tuyển',
    description: 'Khi ứng viên được thêm vào vị trí này, các lượt ứng tuyển sẽ xuất hiện tại đây.',
    action: null,
  },
  long: { title: 'Chưa có nội dung', description: null, action: null },
} as const;

type PanelId = 'light' | 'dark' | 'mobile';

const demo = (page: Page) => page.getByTestId('ui-demo-AtsEmptyState');
const panel = (page: Page, id: PanelId) => demo(page).locator(`[data-panel="${id}"]`);
const emptyState = (page: Page, id: PanelId, state: keyof typeof STATES) =>
  panel(page, id).locator(`[data-state="${state}"] .ats-empty-state`);

function measure(root: Locator) {
  return root.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const children = Array.from(el.children).map((c) => {
      const cr = c.getBoundingClientRect();
      return { cls: c.className, top: cr.top, bottom: cr.bottom, centre: cr.left + cr.width / 2 };
    });
    const icon = el.querySelector('.ats-empty-state__icon')!;
    const ir = icon.getBoundingClientRect();
    const title = el.querySelector('.ats-empty-state__title')!;
    const ts = getComputedStyle(title);
    const desc = el.querySelector('.ats-empty-state__description');
    const ds = desc ? getComputedStyle(desc) : null;
    const button = el.querySelector('button');
    const bs = button ? getComputedStyle(button) : null;
    return {
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
      background: s.backgroundColor,
      textAlign: s.textAlign,
      width: r.width,
      centre: r.left + r.width / 2,
      overflowX: el.scrollWidth - el.clientWidth,
      children,
      icon: {
        size: [ir.width, ir.height],
        fill: getComputedStyle(icon).backgroundColor,
        ariaHidden: icon.getAttribute('aria-hidden'),
        svgHidden: icon.querySelector('svg')?.getAttribute('aria-hidden') ?? null,
        svgSize: (() => {
          const sr = icon.querySelector('svg')?.getBoundingClientRect();
          return sr ? [sr.width, sr.height] : null;
        })(),
      },
      title: {
        tag: title.tagName,
        color: ts.color,
        fontSize: ts.fontSize,
        fontWeight: ts.fontWeight,
      },
      description: desc
        ? {
            color: ds!.color,
            fontSize: ds!.fontSize,
            width: desc.getBoundingClientRect().width,
            height: desc.getBoundingClientRect().height,
            lineHeight: parseFloat(ds!.lineHeight),
            overflowX: desc.scrollWidth - desc.clientWidth,
          }
        : null,
      button: button
        ? {
            fill: bs!.backgroundColor,
            border: bs!.borderTopColor,
            width: button.getBoundingClientRect().width,
            classes: button.className,
          }
        : null,
    };
  });
}

test.describe('Empty state (AtsEmptyState)', () => {
  // The first visit compiles the gallery in Vite, which can take a while on a cold dev server.
  test.setTimeout(60_000);

  test('light and dark panels match "QA · Empty state spacing" on desktop: inset 28/48, gap 12, 64 px accent icon, centred copy', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      const t = TOKENS[theme];
      for (const [state, copy] of Object.entries(STATES) as [
        keyof typeof STATES,
        (typeof STATES)[keyof typeof STATES],
      ][]) {
        const root = emptyState(page, theme, state);
        await expect(root.getByRole('heading', { level: 5 })).toHaveText(copy.title);
        if (copy.description) {
          await expect(root.locator('.ats-empty-state__description')).toHaveText(copy.description);
        }
        const r = await measure(root);
        const where = `${theme}/${state}`;

        expect(r.padding, `${where}: inset`).toEqual(['28px', '48px', '28px', '48px']);
        expect(r.background, `${where}: surface`).toBe(t.surface);
        expect(r.textAlign, `${where}: text-align`).toBe('center');
        expect(r.overflowX, `${where}: no horizontal overflow`).toBeLessThanOrEqual(0);

        // 12 px between every pair of parts, every part centred on the container.
        for (let i = 1; i < r.children.length; i++) {
          const gap = r.children[i]!.top - r.children[i - 1]!.bottom;
          expect(gap, `${where}: gap before ${r.children[i]!.cls}`).toBeCloseTo(12, 0);
        }
        for (const c of r.children) {
          expect(Math.abs(c.centre - r.centre), `${where}: ${c.cls} centred`).toBeLessThanOrEqual(
            1,
          );
        }

        expect(r.icon.size, `${where}: icon surface`).toEqual([64, 64]);
        expect(r.icon.fill, `${where}: icon fill`).toBe(t.accent);
        expect(r.icon.ariaHidden, `${where}: icon decorative`).toBe('true');
        expect(r.icon.svgSize, `${where}: glyph size`).toEqual([32, 32]);

        expect(r.title.tag).toBe('H5');
        expect(r.title.color, `${where}: title ink`).toBe(t.ink);
        expect(r.title.fontSize).toBe('18px');
        expect(r.title.fontWeight).toBe('700');

        if (r.description) {
          expect(r.description.color, `${where}: description muted`).toBe(t.muted);
          expect(r.description.fontSize).toBe('14px');
          expect(r.description.width, `${where}: readable width`).toBeLessThanOrEqual(520);
        }

        if (copy.action) {
          const button = root.getByRole('button', { name: copy.action });
          await expect(button).toBeVisible();
          expect(r.button?.classes, `${where}: linked Button`).toContain('ats-button--primary');
          expect(r.button?.fill, `${where}: button fill`).toBe(t.action);
          expect(r.button?.border, `${where}: button border`).toBe(t.actionLine);
          expect(r.button!.width, `${where}: button width`).toBeGreaterThanOrEqual(160);
        } else {
          await expect(root.getByRole('button')).toHaveCount(0);
          await expect(root.locator('.ats-empty-state__action')).toHaveCount(0);
        }
      }
    }

    await demo(page).screenshot({
      path: test.info().outputPath('empty-state-gallery-desktop.png'),
    });
  });

  test('clicking "Xóa bộ lọc" emits action once per click; the states without an action have no button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    const section = panel(page, 'light').locator('[data-state="action"]');
    await expect(section.locator('.empty-state-demo__state')).toHaveText(
      'With action · cleared 0×',
    );
    await section.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(section.locator('.empty-state-demo__state')).toHaveText(
      'With action · cleared 1×',
    );
    await section.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await expect(section.locator('.empty-state-demo__state')).toHaveText(
      'With action · cleared 2×',
    );

    for (const id of ['light', 'dark', 'mobile'] as const) {
      await expect(panel(page, id).locator('[data-state="no-action"] button')).toHaveCount(0);
      await expect(panel(page, id).locator('[data-state="long"] button')).toHaveCount(0);
    }
  });

  test('at a 360 px viewport the inset is 28/20 and the long Vietnamese description wraps with no horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    for (const id of ['light', 'dark', 'mobile'] as const) {
      for (const state of Object.keys(STATES) as (keyof typeof STATES)[]) {
        const root = emptyState(page, id, state);
        const r = await measure(root);
        const where = `${id}/${state}`;
        expect(r.padding, `${where}: mobile inset`).toEqual(['28px', '20px', '28px', '20px']);
        expect(r.overflowX, `${where}: no horizontal overflow`).toBeLessThanOrEqual(0);
        expect(r.icon.size, `${where}: icon surface`).toEqual([64, 64]);
        for (let i = 1; i < r.children.length; i++) {
          const gap = r.children[i]!.top - r.children[i - 1]!.bottom;
          expect(gap, `${where}: gap`).toBeCloseTo(12, 0);
        }
        if (r.description) {
          expect(r.description.overflowX, `${where}: description overflow`).toBeLessThanOrEqual(0);
        }
        // The empty state stays inside its container. The light and dark panels are fluid, so they
        // also stay inside the 360 px viewport; the "360 px" panel is a fixed 360 px box offset by the
        // gallery padding, so only containment is meaningful there.
        const box = (await root.boundingBox())!;
        const parent = (await root.locator('..').boundingBox())!;
        expect(box.x + box.width, `${where}: inside its container`).toBeLessThanOrEqual(
          parent.x + parent.width + 0.5,
        );
        if (id !== 'mobile') {
          expect(box.x + box.width, `${where}: inside the viewport`).toBeLessThanOrEqual(360);
        }
      }

      const long = await measure(emptyState(page, id, 'long'));
      expect(
        long.description!.height / long.description!.lineHeight,
        `${id}: long description wraps onto several lines`,
      ).toBeGreaterThanOrEqual(3);
    }

    await panel(page, 'mobile').screenshot({
      path: test.info().outputPath('empty-state-gallery-360.png'),
    });
  });

  test('in the 360 px gallery panel on a desktop viewport the long description still wraps inside the panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dev/ui');
    await expect(demo(page)).toBeVisible();

    const mobile = panel(page, 'mobile');
    expect((await mobile.boundingBox())!.width).toBe(360);
    const r = await measure(emptyState(page, 'mobile', 'long'));
    expect(r.overflowX).toBeLessThanOrEqual(0);
    expect(r.description!.overflowX).toBeLessThanOrEqual(0);
    expect(r.description!.height / r.description!.lineHeight).toBeGreaterThanOrEqual(3);
    expect(await mobile.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});
