// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import AtsTab from './AtsTab.vue';
import AtsTabs from './AtsTabs.vue';

const source = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/ui', file), 'utf8');
const style = (file: string) => /<style[^>]*>([\s\S]*)<\/style>/.exec(source(file))?.[1] ?? '';

interface TabSpec {
  value: string;
  label: string;
  disabled?: boolean;
  controls?: string;
}

const TABS: TabSpec[] = [
  { value: 'apply', label: 'Ứng tuyển' },
  { value: 'plan', label: 'Kế hoạch' },
  { value: 'content', label: 'Nội dung', disabled: true },
  { value: 'process', label: 'Quy trình' },
  { value: 'publish', label: 'Đăng tuyển', disabled: true },
];

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

/** A caller using v-model, so the selection round-trips through the parent as in product code. */
async function mountTabs(initial: string | undefined, tabs: TabSpec[] = TABS) {
  const selected = ref<string | undefined>(initial);
  const Host = defineComponent({
    setup: () => () =>
      h(
        AtsTabs,
        {
          label: 'Tin tuyển dụng',
          modelValue: selected.value,
          'onUpdate:modelValue': (value: string | number | undefined) => {
            selected.value = value as string;
          },
        },
        () =>
          tabs.map((tab) =>
            h(AtsTab, {
              key: tab.value,
              value: tab.value,
              label: tab.label,
              disabled: tab.disabled,
              'aria-controls': tab.controls,
            }),
          ),
      ),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  mounted.push(wrapper);
  // Tabs register while the row renders; the roving tabindex settles on the next tick.
  await nextTick();
  const tabEls = () => wrapper.findAll('[role="tab"]');
  const tab = (value: string) => tabEls()[tabs.findIndex((t) => t.value === value)]!;
  return { wrapper, selected, tabEls, tab };
}

const selectedValues = (tabs: Awaited<ReturnType<typeof mountTabs>>['tabEls']) =>
  tabs()
    .filter((t) => t.attributes('aria-selected') === 'true')
    .map((t) => t.text());

describe('AtsTabs', () => {
  it('renders a labelled tablist of tabs with their labels', async () => {
    const { wrapper, tabEls } = await mountTabs('apply');
    const list = wrapper.get('[role="tablist"]');

    expect(list.attributes('aria-label')).toBe('Tin tuyển dụng');
    expect(tabEls().map((t) => t.text())).toEqual(TABS.map((t) => t.label));
    expect(tabEls().every((t) => t.element.tagName === 'BUTTON')).toBe(true);
    expect(tabEls().every((t) => t.attributes('type') === 'button')).toBe(true);
  });

  it('marks only the v-model tab as selected', async () => {
    const { tabEls } = await mountTabs('plan');

    expect(selectedValues(tabEls)).toEqual(['Kế hoạch']);
    expect(tabEls()[0]!.attributes('aria-selected')).toBe('false');
  });

  it('selects a tab on click and updates v-model', async () => {
    const { selected, tab, tabEls } = await mountTabs('apply');

    await tab('process').trigger('click');

    expect(selected.value).toBe('process');
    expect(selectedValues(tabEls)).toEqual(['Quy trình']);
  });

  it('ignores clicks on a disabled tab', async () => {
    const { selected, tab, tabEls } = await mountTabs('apply');

    await tab('content').trigger('click');

    expect(selected.value).toBe('apply');
    expect(selectedValues(tabEls)).toEqual(['Ứng tuyển']);
    expect(tab('content').attributes('aria-disabled')).toBe('true');
  });

  it('moves focus and selection with Arrow Right, skipping disabled tabs and wrapping', async () => {
    const { selected, tab } = await mountTabs('plan');

    (tab('plan').element as HTMLElement).focus();
    await tab('plan').trigger('keydown', { key: 'ArrowRight' });
    expect(selected.value).toBe('process');
    expect(document.activeElement).toBe(tab('process').element);

    await tab('process').trigger('keydown', { key: 'ArrowRight' });
    expect(selected.value).toBe('apply');
    expect(document.activeElement).toBe(tab('apply').element);
  });

  it('moves focus and selection with Arrow Left, skipping disabled tabs and wrapping', async () => {
    const { selected, tab } = await mountTabs('process');

    await tab('process').trigger('keydown', { key: 'ArrowLeft' });
    expect(selected.value).toBe('plan');
    expect(document.activeElement).toBe(tab('plan').element);

    await tab('plan').trigger('keydown', { key: 'ArrowLeft' });
    await tab('apply').trigger('keydown', { key: 'ArrowLeft' });
    expect(selected.value).toBe('process');
    expect(document.activeElement).toBe(tab('process').element);
  });

  it('jumps to the first and last enabled tab with Home and End', async () => {
    const { selected, tab } = await mountTabs('plan');

    await tab('plan').trigger('keydown', { key: 'End' });
    expect(selected.value).toBe('process');
    expect(document.activeElement).toBe(tab('process').element);

    await tab('process').trigger('keydown', { key: 'Home' });
    expect(selected.value).toBe('apply');
    expect(document.activeElement).toBe(tab('apply').element);
  });

  it('skips a disabled first tab for Home', async () => {
    const tabs: TabSpec[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ];
    const { selected, tab } = await mountTabs('c', tabs);

    await tab('c').trigger('keydown', { key: 'Home' });

    expect(selected.value).toBe('b');
  });

  it('leaves other keys alone', async () => {
    const { selected, tab } = await mountTabs('plan');

    await tab('plan').trigger('keydown', { key: 'ArrowDown' });
    await tab('plan').trigger('keydown', { key: 'a' });

    expect(selected.value).toBe('plan');
  });

  it('puts only the selected tab in the Tab order', async () => {
    const { tab, tabEls } = await mountTabs('plan');

    expect(tabEls().map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);

    await tab('process').trigger('click');
    expect(tabEls().map((t) => t.attributes('tabindex'))).toEqual(['-1', '-1', '-1', '0', '-1']);
  });

  it('puts the first enabled tab in the Tab order when nothing is selected', async () => {
    const tabs: TabSpec[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
    ];
    const { tabEls } = await mountTabs(undefined, tabs);

    expect(tabEls().map((t) => t.attributes('tabindex'))).toEqual(['-1', '0']);
  });

  it('keeps a disabled selected tab selected and reachable, from where arrows leave it', async () => {
    const { selected, tab } = await mountTabs('content');

    expect(tab('content').attributes('aria-selected')).toBe('true');
    expect(tab('content').attributes('tabindex')).toBe('0');
    expect(tab('content').attributes('disabled')).toBeUndefined();

    await tab('content').trigger('keydown', { key: 'ArrowRight' });
    expect(selected.value).toBe('process');
  });

  it('passes aria-controls through to the tab', async () => {
    const { tab } = await mountTabs('apply', [
      { value: 'apply', label: 'Ứng tuyển', controls: 'panel-apply' },
      { value: 'plan', label: 'Kế hoạch' },
    ]);

    expect(tab('apply').attributes('aria-controls')).toBe('panel-apply');
    expect(tab('plan').attributes('aria-controls')).toBeUndefined();
  });

  it('renders the indicator in every state, so selection never shifts the row', async () => {
    const { tabEls } = await mountTabs('plan');

    for (const t of tabEls()) {
      expect(t.findAll('.ats-tab__indicator')).toHaveLength(1);
      expect(t.get('.ats-tab__indicator').attributes('aria-hidden')).toBe('true');
    }
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    const css = () => style('AtsTab.vue');
    const mobile = () => /@media\s*\(max-width:\s*767px\)\s*\{([\s\S]*?)\}\s*\}/.exec(css())?.[1];

    it('reserves a 2 px indicator 4 px below the label in every state', () => {
      const indicator = /\.ats-tab__indicator\s*\{([^}]*)\}/.exec(css())?.[1];

      expect(indicator).toMatch(/height:\s*2px/);
      expect(indicator).toMatch(/margin-top:\s*var\(--space-1\)/);
      expect(indicator).toMatch(/background:\s*transparent/);
      expect(css()).toMatch(
        /\[aria-selected='true'\]\s*\.ats-tab__indicator\s*\{[^}]*background:\s*var\(--color-action-line\)/,
      );
    });

    it('makes the selected label bold', () => {
      expect(css()).toMatch(
        /\.ats-tab\[aria-selected='true'\]\s*\{[^}]*font-weight:\s*var\(--font-weight-bold\)/,
      );
    });

    it('is at least 36 px with insets 8/12 on desktop, 44 px with insets 12/12 and wrapping on mobile', () => {
      const base = /\.ats-tab\s*\{([^}]*)\}/.exec(css())?.[1];

      expect(base).toMatch(/min-height:\s*36px/);
      expect(base).toMatch(/padding:\s*var\(--space-2\)\s+var\(--space-3\)/);
      expect(base).toMatch(/line-height:\s*var\(--line-height-xs\)/);
      expect(mobile()).toMatch(/min-height:\s*var\(--touch-target-min\)/);
      expect(mobile()).toMatch(/padding:\s*var\(--space-3\)/);
      expect(mobile()).toMatch(/white-space:\s*normal/);
    });

    it('draws the 3 px focus ring outside the tab', () => {
      const focus = /\.ats-tab:focus-visible[^{]*\{([^}]*)\}/.exec(css())?.[1];

      expect(focus).toMatch(
        /outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--color-focus-ring\)/,
      );
      expect(focus).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
    });

    it('dims a disabled tab, indicator included', () => {
      expect(css()).toMatch(
        /\.ats-tab\[aria-disabled='true'\]\s*\{[^}]*opacity:\s*var\(--opacity-disabled\)/,
      );
    });

    it('uses tokens only, never a raw colour', () => {
      for (const file of ['AtsTab.vue', 'AtsTabs.vue', 'AtsTabs.demo.vue']) {
        expect(style(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      }
    });
  });
});
