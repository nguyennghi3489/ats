// Issue #41: the ATS icon set (AtsIcon) and the dev-only UI gallery at /dev/ui.
// The gallery collects every src/components/ui/**/*.demo.vue and shows each demo in a light panel,
// a dark panel (data-theme="dark" on the wrapper) and a 360 px panel. Icons are drawn in currentColor,
// so they must take each panel's text colour. The gallery is developer tooling with no product copy,
// so there is no vi/en variant to compare.
// Runs against the Vite dev server (playwright.config.ts); the production check is ui-gallery-prod.spec.ts.
import { expect, test, type Locator } from '@playwright/test';

const ICONS = [
  'archive-box',
  'chevron-down',
  'close',
  'edit',
  'empty',
  'error',
  'info',
  'more',
  'profile',
  'spinner',
  'success',
  'trash',
];

// --color-ink from src/styles/tokens.css, as the browser reports it.
const INK = { light: 'rgb(41, 40, 34)', dark: 'rgb(244, 241, 232)' };

const colour = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).color);

test.describe('UI gallery', () => {
  test('shows all 12 icons in light, dark and 360 px panels, in the panel text colour', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dev/ui');

    await expect(page.getByTestId('ui-gallery')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'UI gallery' })).toBeVisible();
    const demo = page.getByTestId('ui-demo-AtsIcon');
    await expect(demo).toBeVisible();

    const panels = demo.locator('[data-panel]');
    await expect(panels).toHaveCount(3);
    expect(
      await panels.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel'))),
    ).toEqual(['light', 'dark', 'mobile']);

    for (const id of ['light', 'dark', 'mobile'] as const) {
      const panel = demo.locator(`[data-panel="${id}"]`);
      await expect(panel).toBeVisible();
      await expect(panel.locator('svg.ats-icon')).toHaveCount(ICONS.length);
      expect(await panel.locator('code').allTextContents()).toEqual(ICONS);

      const panelColour = await colour(panel);
      const icons = panel.locator('svg.ats-icon');
      for (let i = 0; i < ICONS.length; i += 1) {
        const icon = icons.nth(i);
        await expect(icon).toBeVisible();
        await expect(icon).toHaveAttribute('stroke', 'currentColor');
        await expect(icon).toHaveAttribute('aria-hidden', 'true');
        expect(await colour(icon), `${id} / ${ICONS[i]} follows the panel colour`).toBe(
          panelColour,
        );
        const box = await icon.boundingBox();
        expect(box?.width, `${ICONS[i]} has a size`).toBeGreaterThan(0);
      }
    }

    // Light panel uses light ink, dark panel dark ink; the 360 px panel follows the app theme (light).
    await expect(demo.locator('[data-panel="light"]')).toHaveAttribute('data-theme', 'light');
    await expect(demo.locator('[data-panel="dark"]')).toHaveAttribute('data-theme', 'dark');
    expect(await colour(demo.locator('[data-panel="light"]'))).toBe(INK.light);
    expect(await colour(demo.locator('[data-panel="dark"]'))).toBe(INK.dark);
    expect(await colour(demo.locator('[data-panel="mobile"]'))).toBe(INK.light);

    const mobile = await demo.locator('[data-panel="mobile"]').boundingBox();
    expect(mobile?.width).toBe(360);

    await page.screenshot({ path: test.info().outputPath('ui-gallery-light.png'), fullPage: true });
  });

  test('the dark panel stays dark and the light panel light when the app is dark', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dev/ui');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const demo = page.getByTestId('ui-demo-AtsIcon');
    await expect(demo).toBeVisible();
    expect(await colour(demo.locator('[data-panel="light"]'))).toBe(INK.light);
    expect(await colour(demo.locator('[data-panel="dark"]'))).toBe(INK.dark);
    expect(await colour(demo.locator('[data-panel="mobile"]'))).toBe(INK.dark);
    expect(await colour(demo.locator('[data-panel="light"] svg.ats-icon').first())).toBe(INK.light);
    expect(await colour(demo.locator('[data-panel="mobile"] svg.ats-icon').first())).toBe(INK.dark);

    await page.screenshot({ path: test.info().outputPath('ui-gallery-dark.png'), fullPage: true });
  });

  test('on a 360 px viewport the gallery renders every icon and the light panel fits on screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/dev/ui');

    const demo = page.getByTestId('ui-demo-AtsIcon');
    await expect(demo.locator('svg.ats-icon')).toHaveCount(ICONS.length * 3);
    // Other demos (AtsButton) come first, so bring the icon panel up before checking it fits.
    await demo.locator('[data-panel="light"]').scrollIntoViewIfNeeded();
    for (const icon of await demo.locator('[data-panel="light"] svg.ats-icon').all()) {
      await expect(icon).toBeInViewport();
    }

    await page.screenshot({ path: test.info().outputPath('ui-gallery-360.png'), fullPage: true });
  });

  test('the spinner rotates, and stops under prefers-reduced-motion: reduce', async ({ page }) => {
    const spinnerState = () =>
      page
        .getByTestId('ui-demo-AtsIcon')
        .locator('[data-panel="light"] svg.ats-icon--spin')
        .evaluate(async (el) => {
          const style = getComputedStyle(el);
          const first = style.transform;
          await new Promise((resolve) => setTimeout(resolve, 150));
          return {
            animationName: style.animationName,
            running: el.getAnimations().length,
            moved: first !== getComputedStyle(el).transform,
          };
        });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/dev/ui');
    const spinning = await spinnerState();
    expect(spinning.animationName).not.toBe('none');
    expect(spinning.running).toBeGreaterThan(0);
    expect(spinning.moved, 'spinner transform changes over time').toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const still = await spinnerState();
    expect(still.animationName).toBe('none');
    expect(still.running).toBe(0);
    expect(still.moved, 'spinner transform stays the same').toBe(false);

    // Only the spinner spins (other demos, such as a pending AtsButton or AtsIconButton, nest spinners
    // of their own).
    await expect(page.getByTestId('ui-demo-AtsIcon').locator('svg.ats-icon--spin')).toHaveCount(3);
  });
});
