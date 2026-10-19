// Node types for this spec only: the sizing tests read the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import AtsNavItem from './AtsNavItem.vue';

const LABEL = 'Ứng tuyển';
const LONG_LABEL = 'Ứng tuyển được phân công cần xem xét hôm nay';

type Props = InstanceType<typeof AtsNavItem>['$props'];

const Page = defineComponent({ render: () => h('div') });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Page },
      {
        path: '/applications',
        name: 'applications',
        component: Page,
        children: [{ path: ':id', name: 'application', component: Page }],
      },
      { path: '/jobs', name: 'jobs', component: Page },
    ],
  });
}

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

async function mountNavItem(
  props: Partial<Props> = {},
  { at = '/', router = makeRouter() }: { at?: string; router?: Router } = {},
) {
  await router.push(at);
  await router.isReady();
  const wrapper = mount(AtsNavItem, {
    props: { to: { name: 'applications' }, label: LABEL, ...props },
    slots: { icon: '<svg data-testid="icon" width="16" height="16"></svg>' },
    global: { plugins: [router] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return { wrapper, router };
}

describe('AtsNavItem', () => {
  it('renders a link to its route with the label and the icon slot', async () => {
    const { wrapper } = await mountNavItem();
    const link = wrapper.get('a');

    expect(link.attributes('href')).toBe('/applications');
    expect(link.text()).toBe(LABEL);
    expect(link.find('[data-testid="icon"]').exists()).toBe(true);
    // The icon is decoration next to the label; the label is the accessible name.
    expect(wrapper.get('.ats-nav-item__icon').attributes('aria-hidden')).toBe('true');
  });

  it('is selected with aria-current="page" on the route it points to', async () => {
    const { wrapper } = await mountNavItem({}, { at: '/applications' });
    const link = wrapper.get('a');

    expect(link.attributes('aria-current')).toBe('page');
    expect(link.classes()).toContain('ats-nav-item--selected');
  });

  it('stays selected on a child route of its destination', async () => {
    const { wrapper } = await mountNavItem({}, { at: '/applications/42' });

    expect(wrapper.get('a').attributes('aria-current')).toBe('page');
  });

  it('is not selected on another route', async () => {
    const { wrapper } = await mountNavItem({}, { at: '/jobs' });
    const link = wrapper.get('a');

    expect(link.attributes('aria-current')).toBeUndefined();
    expect(link.classes()).not.toContain('ats-nav-item--selected');
  });

  it('follows the route as it changes', async () => {
    const { wrapper, router } = await mountNavItem({}, { at: '/jobs' });

    await router.push('/applications');
    await flushPromises();
    expect(wrapper.get('a').attributes('aria-current')).toBe('page');

    await router.push('/');
    await flushPromises();
    expect(wrapper.get('a').attributes('aria-current')).toBeUndefined();
  });

  it('lets the selected prop override the route match either way', async () => {
    const forced = await mountNavItem({ selected: true }, { at: '/jobs' });
    expect(forced.wrapper.get('a').attributes('aria-current')).toBe('page');
    expect(forced.wrapper.get('a').classes()).toContain('ats-nav-item--selected');

    const cleared = await mountNavItem({ selected: false }, { at: '/applications' });
    expect(cleared.wrapper.get('a').attributes('aria-current')).toBeUndefined();
    expect(cleared.wrapper.get('a').classes()).not.toContain('ats-nav-item--selected');
  });

  it('navigates when an enabled item is clicked', async () => {
    const { wrapper, router } = await mountNavItem({}, { at: '/jobs' });

    await wrapper.get('a').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/applications');
    expect(wrapper.get('a').attributes('aria-current')).toBe('page');
  });

  it('renders a disabled item as a non-link that is skipped by Tab and does not navigate', async () => {
    const { wrapper, router } = await mountNavItem({ disabled: true }, { at: '/jobs' });

    expect(wrapper.find('a').exists()).toBe(false);
    const item = wrapper.get('.ats-nav-item');
    expect(item.attributes('aria-disabled')).toBe('true');
    expect(item.attributes('href')).toBeUndefined();
    expect(item.attributes('tabindex')).toBeUndefined();
    expect(item.classes()).toContain('ats-nav-item--disabled');
    // Not focusable: no href, no tabindex, no native control. Tab order skips it.
    expect((item.element as HTMLElement).tabIndex).toBe(-1);
    expect(item.text()).toBe(LABEL);

    await item.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/jobs');
  });

  it('keeps the selected look and aria-current when disabled and selected', async () => {
    const { wrapper } = await mountNavItem({ disabled: true }, { at: '/applications' });
    const item = wrapper.get('.ats-nav-item');

    expect(item.classes()).toEqual(
      expect.arrayContaining(['ats-nav-item--disabled', 'ats-nav-item--selected']),
    );
    expect(item.attributes('aria-current')).toBe('page');
  });

  it('shows a long label in full so it can wrap beside the icon', async () => {
    const { wrapper } = await mountNavItem({ label: LONG_LABEL });

    expect(wrapper.get('.ats-nav-item__label').text()).toBe(LONG_LABEL);
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsNavItem.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const mobile = /@media[^{]*max-width[^{]*\{([\s\S]*?)\}\s*\}/.exec(style)?.[1] ?? '';
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        style,
      )?.[1] ?? '';

    it('is at least 40 px high on desktop, with a 12 px inset and a 10 px icon gap', () => {
      const base = rule('.ats-nav-item');
      expect(base).toMatch(/min-height:\s*40px/);
      expect(base).toMatch(/padding-inline:\s*var\(--space-3\)/);
      expect(base).toMatch(/gap:\s*10px/);
    });

    it('is at least 44 px high on mobile and wraps long labels with 8 px vertical padding', () => {
      expect(mobile).toMatch(/min-height:\s*var\(--touch-target-min\)/);
      expect(mobile).toMatch(/padding-block:\s*var\(--space-2\)/);
      const label = rule('.ats-nav-item__label');
      expect(label).not.toMatch(/white-space:\s*nowrap|text-overflow/);
      expect(rule('.ats-nav-item')).toMatch(/align-items:\s*center/);
    });

    it('uses the sidebar, accent and focus tokens and no raw colours', () => {
      expect(rule('.ats-nav-item')).toMatch(/background:\s*var\(--color-sidebar\)/);
      expect(style).toMatch(/\.ats-nav-item--selected[^{]*\{[^}]*--color-accent/);
      expect(style).toMatch(/\.ats-nav-item--selected[^{]*\{[^}]*--font-weight-bold/);
      expect(style).toMatch(/:focus-visible[^{]*\{[^}]*outline:[^;]*--color-focus-ring/);
      expect(rule('.ats-nav-item--disabled')).toMatch(/opacity:\s*var\(--opacity-disabled\)/);
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });

    it('takes the accent surface on hover, except when disabled', () => {
      expect(style).toMatch(
        /\.ats-nav-item:hover:not\(\.ats-nav-item--disabled\)\s*\{[^}]*--color-accent/,
      );
    });
  });
});
