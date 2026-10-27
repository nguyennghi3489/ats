// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import AtsButton from './AtsButton.vue';
import AtsMenu from './AtsMenu.vue';
import AtsMenuItem from './AtsMenuItem.vue';
import type { IconName } from './icons';

const source = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/ui', file), 'utf8');
const style = (file: string) => /<style[^>]*>([\s\S]*)<\/style>/.exec(source(file))?.[1] ?? '';

interface ItemSpec {
  label: string;
  icon?: IconName;
  disabled?: boolean;
  danger?: boolean;
  to?: string;
}

const ITEMS: ItemSpec[] = [
  { label: 'Mở hồ sơ', icon: 'profile' },
  { label: 'Chỉnh sửa hồ sơ', icon: 'edit' },
  { label: 'Không khả dụng', icon: 'profile', disabled: true },
  { label: 'Lưu trữ hồ sơ', icon: 'archive-box', danger: true },
];

const Page = defineComponent({ render: () => h('div') });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/candidates/:id', name: 'candidate', component: Page },
    ],
  });
}

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
});

async function mountMenu(
  items: ItemSpec[] = ITEMS,
  menuProps: Record<string, unknown> = { heading: 'Hồ sơ ứng viên' },
) {
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  const onSelect = vi.fn();
  const Host = defineComponent({
    setup: () => () =>
      h('div', [
        h(AtsMenu, menuProps, {
          trigger: ({ props }: { props: Record<string, unknown> }) =>
            h(
              AtsButton,
              { ...props, variant: 'outline', 'data-testid': 'trigger' },
              () => 'Thao tác',
            ),
          default: () =>
            items.map((item) =>
              h(AtsMenuItem, {
                key: item.label,
                ...item,
                onSelect: () => onSelect(item.label),
              }),
            ),
        }),
        h('button', { 'data-testid': 'outside' }, 'Bên ngoài'),
      ]),
  });
  const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [router] } });
  mounted.push(wrapper);
  const trigger = () => document.querySelector<HTMLElement>('[data-testid="trigger"]')!;
  const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
  const items_ = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const item = (label: string) => items_().find((el) => el.textContent?.trim() === label)!;
  return { wrapper, router, onSelect, trigger, menu, items: items_, item };
}

function key(el: Element, name: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

async function settle() {
  await nextTick();
  await flushPromises();
}

describe('AtsMenu', () => {
  it('wires the trigger with aria-haspopup, aria-expanded and aria-controls', async () => {
    const { trigger, menu } = await mountMenu();

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();

    trigger().click();
    await settle();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute('aria-controls')).toBe(menu()!.id);
  });

  it('renders the panel in a teleport layer, outside the component tree', async () => {
    const { wrapper, trigger, menu } = await mountMenu();
    trigger().click();
    await settle();

    expect(wrapper.element.contains(menu())).toBe(false);
    expect(menu()!.parentElement).toBe(document.body);
  });

  it('shows the heading as the menu name and the items with role="menuitem"', async () => {
    const { trigger, menu, items } = await mountMenu();
    trigger().click();
    await settle();

    const heading = document.getElementById(menu()!.getAttribute('aria-labelledby')!);
    expect(heading?.textContent?.trim()).toBe('Hồ sơ ứng viên');
    expect(items().map((el) => el.textContent?.trim())).toEqual(ITEMS.map((i) => i.label));
    expect(items()[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(items()[3]!.classList).toContain('ats-menu-item--danger');
    // Icons are decoration next to the label.
    expect(items()[0]!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('is named by the trigger when there is no heading', async () => {
    const { trigger, menu } = await mountMenu(ITEMS, {});
    trigger().click();
    await settle();

    expect(menu()!.getAttribute('aria-labelledby')).toBe(trigger().id);
    expect(menu()!.querySelector('.ats-menu__heading')).toBeNull();
  });

  it('opens on Arrow Down from the trigger with the first item focused', async () => {
    const { trigger, items } = await mountMenu();
    trigger().focus();
    key(trigger(), 'ArrowDown');
    await settle();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('opens on Arrow Up from the trigger with the last enabled item focused', async () => {
    const { trigger, item } = await mountMenu();
    key(trigger(), 'ArrowUp');
    await settle();

    expect(document.activeElement).toBe(item('Lưu trữ hồ sơ'));
  });

  it('opens on Enter and Space from the trigger with the first item focused', async () => {
    for (const name of ['Enter', ' ']) {
      const { trigger, items } = await mountMenu();
      key(trigger(), name);
      await settle();

      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(items()[0]);
      mounted.splice(0).forEach((wrapper) => wrapper.unmount());
    }
  });

  it('moves with the arrow keys, skipping disabled items and wrapping', async () => {
    const { trigger, item } = await mountMenu();
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(item('Chỉnh sửa hồ sơ'));
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(item('Lưu trữ hồ sơ'));
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(item('Mở hồ sơ'));
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(item('Lưu trữ hồ sơ'));
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(item('Chỉnh sửa hồ sơ'));
  });

  it('jumps to the first and last enabled items with Home and End', async () => {
    const items: ItemSpec[] = [
      { label: 'Tắt', disabled: true },
      ...ITEMS,
      { label: 'Hết', disabled: true },
    ];
    const { trigger, item } = await mountMenu(items);
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, 'End');
    expect(document.activeElement).toBe(item('Lưu trữ hồ sơ'));
    key(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(item('Mở hồ sơ'));
  });

  it('moves to the next enabled item starting with a typed letter', async () => {
    const { trigger, item } = await mountMenu();
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, 'l');
    expect(document.activeElement).toBe(item('Lưu trữ hồ sơ'));
    key(document.activeElement!, 'C');
    expect(document.activeElement).toBe(item('Chỉnh sửa hồ sơ'));
    // The disabled "Không khả dụng" is skipped: nothing else starts with K, so focus stays.
    key(document.activeElement!, 'k');
    expect(document.activeElement).toBe(item('Chỉnh sửa hồ sơ'));
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { trigger, menu } = await mountMenu();
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, 'Escape');
    await settle();

    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Tab', async () => {
    const { trigger, menu } = await mountMenu();
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, 'Tab');
    await settle();

    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when the user clicks outside, but not inside the panel', async () => {
    const { trigger, menu } = await mountMenu();
    trigger().click();
    await settle();

    menu()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(menu()).not.toBeNull();

    const outside = document.querySelector('[data-testid="outside"]')!;
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles closed when the trigger is clicked again', async () => {
    const { trigger, menu } = await mountMenu();
    trigger().click();
    await settle();
    trigger().click();
    await settle();

    expect(menu()).toBeNull();
  });

  it('emits select and closes after a selection, focusing the trigger', async () => {
    const { trigger, menu, item, onSelect } = await mountMenu();
    trigger().click();
    await settle();

    item('Lưu trữ hồ sơ').click();
    await settle();

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('Lưu trữ hồ sơ');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('selects the focused item with Space', async () => {
    const { trigger, menu, onSelect } = await mountMenu();
    key(trigger(), 'ArrowDown');
    await settle();

    key(document.activeElement!, ' ');
    await settle();

    expect(onSelect).toHaveBeenCalledWith('Mở hồ sơ');
    expect(menu()).toBeNull();
  });

  it('emits nothing and stays open when a disabled item is clicked', async () => {
    const { trigger, menu, item, onSelect } = await mountMenu();
    trigger().click();
    await settle();

    item('Không khả dụng').click();
    key(item('Không khả dụng'), ' ');
    await settle();

    expect(onSelect).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it('navigates to `to` and closes when a link item is selected', async () => {
    const items: ItemSpec[] = [{ label: 'Mở hồ sơ', icon: 'profile', to: '/candidates/7' }];
    const { trigger, menu, item, router, onSelect } = await mountMenu(items);
    trigger().click();
    await settle();

    const link = item('Mở hồ sơ');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/candidates/7');
    link.click();
    await settle();

    expect(onSelect).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe('/candidates/7');
    expect(menu()).toBeNull();
  });

  it('keeps only one Tab stop: items are reached with the arrow keys', async () => {
    const { trigger, items } = await mountMenu();
    trigger().click();
    await settle();

    for (const el of items()) expect(el.getAttribute('tabindex')).toBe('-1');
  });

  it('takes the theme of the trigger, so a dark panel stays dark in the teleport layer', async () => {
    document.body.setAttribute('data-theme', 'dark');
    try {
      const { trigger, menu } = await mountMenu();
      trigger().click();
      await settle();
      expect(menu()!.getAttribute('data-theme')).toBe('dark');
    } finally {
      document.body.removeAttribute('data-theme');
    }
  });

  describe('placement', () => {
    function rect(left: number, top: number, width: number, height: number): DOMRect {
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    }

    let panel = rect(0, 0, 232, 176);

    async function openAt(
      triggerRect: DOMRect,
      viewport: { width: number; height: number },
      placement: 'bottom-start' | 'bottom-end' | 'top-start' = 'bottom-start',
      anchorRect?: DOMRect,
    ) {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(viewport.width);
      vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(viewport.height);
      panel = rect(0, 0, 232, 176);
      const original = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        if (this.getAttribute('data-testid') === 'trigger') return triggerRect;
        if (this.getAttribute('data-testid') === 'anchor' && anchorRect) return anchorRect;
        if (this.getAttribute('role') === 'menu') return panel;
        return original.call(this);
      });
      const anchor = document.createElement('div');
      anchor.setAttribute('data-testid', 'anchor');
      document.body.append(anchor);
      const { trigger, menu } = await mountMenu(ITEMS, {
        heading: 'Hồ sơ ứng viên',
        placement,
        ...(anchorRect ? { anchor: () => anchor } : {}),
      });
      trigger().click();
      await settle();
      const el = menu()!;
      return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
    }

    afterEach(() => {
      vi.restoreAllMocks();
      document.querySelector('[data-testid="anchor"]')?.remove();
    });

    it('opens under the trigger, aligned to its start', async () => {
      const at = await openAt(rect(100, 50, 100, 36), { width: 1280, height: 800 });
      expect(at.left).toBe(100);
      expect(at.top).toBeGreaterThanOrEqual(86);
      expect(at.top).toBeLessThanOrEqual(86 + 8);
    });

    it('aligns to the trigger end with bottom-end', async () => {
      const at = await openAt(rect(600, 50, 36, 36), { width: 1280, height: 800 }, 'bottom-end');
      expect(at.left).toBe(636 - 232);
    });

    it('stays inside a 360 px viewport when opened near the right edge', async () => {
      const at = await openAt(rect(310, 50, 44, 44), { width: 360, height: 640 });
      expect(at.left).toBeGreaterThanOrEqual(0);
      expect(at.left + 232).toBeLessThanOrEqual(360);
    });

    it('opens above the trigger, aligned to its start, with top-start', async () => {
      const at = await openAt(rect(100, 500, 100, 36), { width: 1280, height: 800 }, 'top-start');
      expect(at.left).toBe(100);
      expect(at.top + 176).toBeLessThanOrEqual(500);
      expect(at.top + 176).toBeGreaterThanOrEqual(500 - 8);
    });

    it('opens under the trigger with top-start when there is no room above', async () => {
      const at = await openAt(rect(100, 40, 100, 36), { width: 1280, height: 800 }, 'top-start');
      expect(at.top).toBeGreaterThanOrEqual(76);
    });

    it('places itself against the anchor element when one is given', async () => {
      // The sidebar footer row (16..207, from y 831) holds the "..." trigger at its right end.
      const at = await openAt(
        rect(180, 848, 28, 28),
        { width: 1440, height: 900 },
        'top-start',
        rect(16, 831, 191, 53),
      );
      expect(at.left).toBe(16);
      expect(at.top + 176).toBeLessThanOrEqual(831);
      expect(at.top + 176).toBeGreaterThanOrEqual(831 - 8);
    });

    it('flips above the trigger when there is no room below', async () => {
      const at = await openAt(rect(100, 700, 100, 36), { width: 1280, height: 800 });
      expect(at.top + 176).toBeLessThanOrEqual(700);
      expect(at.top).toBeGreaterThanOrEqual(0);
    });

    it('moves again when its content grows, so a panel above the trigger never covers it', async () => {
      const observed: { callback: () => void; targets: Element[] }[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          targets: Element[] = [];
          constructor(callback: () => void) {
            observed.push({ callback, targets: this.targets });
          }
          observe(target: Element) {
            this.targets.push(target);
          }
          disconnect() {
            this.targets.length = 0;
          }
        },
      );
      await openAt(rect(280, 848, 36, 36), { width: 1440, height: 900 }, 'bottom-end');
      const el = document.querySelector<HTMLElement>('[role="menu"]')!;
      expect(parseFloat(el.style.top) + 176).toBeLessThanOrEqual(848);

      // An error row makes the panel taller and wider.
      panel = rect(0, 0, 275, 236);
      const watcher = observed.find((entry) => entry.targets.includes(el));
      expect(watcher).toBeDefined();
      watcher!.callback();
      await settle();
      expect(parseFloat(el.style.top) + 236).toBeLessThanOrEqual(848);
      expect(parseFloat(el.style.left)).toBe(316 - 275);
      vi.unstubAllGlobals();
    });
  });

  describe('stylesheet', () => {
    const item = style('AtsMenuItem.vue');
    const menu = style('AtsMenu.vue');

    it('uses tokens only, never raw hex colours', () => {
      expect(item).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
      expect(menu).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    });

    it('sizes items 40 px on desktop and 44 px on mobile, inset 8/12, gap 8', () => {
      expect(item).toMatch(/min-height:\s*40px/);
      expect(item).toMatch(
        /@media \(max-width: 767px\)[\s\S]*min-height:\s*var\(--touch-target-min\)/,
      );
      expect(item).toMatch(/padding-block:\s*var\(--space-2\)/);
      expect(item).toMatch(/padding-inline:\s*var\(--space-3\)/);
      expect(item).toMatch(/gap:\s*var\(--space-2\)/);
    });

    it('draws the 3 px focus ring outside with the highlighted fill', () => {
      expect(item).toMatch(
        /:focus-visible[^{]*\{[^}]*outline:\s*var\(--focus-ring-width\) solid var\(--color-focus-ring\)/,
      );
      expect(item).toMatch(/:focus[^{]*\{[^}]*background:\s*var\(--color-accent\)/);
    });

    it('colours danger items with the error colour', () => {
      expect(item).toMatch(/--danger[^{]*\{[^}]*color:\s*var\(--color-danger\)/);
    });
  });
});
