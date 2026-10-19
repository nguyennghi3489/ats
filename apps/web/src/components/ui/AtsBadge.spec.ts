// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import AtsBadge from './AtsBadge.vue';

const LONG_TEXT = 'Đã xác minh bởi người phụ trách tuyển dụng của nhóm kỹ thuật';

describe('AtsBadge', () => {
  it('renders the slot as its text in a neutral span by default', () => {
    const root = mount(AtsBadge, { slots: { default: 'Nhãn' } }).get('.ats-badge');

    expect(root.element.tagName).toBe('SPAN');
    expect(root.text()).toBe('Nhãn');
    expect(root.classes()).toContain('ats-badge--neutral');
  });

  it.each(['neutral', 'accent', 'success', 'danger'] as const)('applies the %s tone', (tone) => {
    const root = mount(AtsBadge, { props: { tone }, slots: { default: 'Nhãn' } }).get('.ats-badge');

    expect(root.classes()).toContain(`ats-badge--${tone}`);
    expect(root.classes().filter((c) => c.startsWith('ats-badge--'))).toHaveLength(1);
  });

  it('puts the icon slot before the text and hides it from assistive technology', () => {
    const root = mount(AtsBadge, {
      slots: { default: 'Đã xác minh', icon: '<svg data-testid="icon"></svg>' },
    }).get('.ats-badge');

    const icon = root.get('.ats-badge__icon');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.find('[data-testid="icon"]').exists()).toBe(true);
    expect(root.element.firstElementChild).toBe(icon.element);
    expect(root.get('.ats-badge__text').text()).toBe('Đã xác minh');
  });

  it('renders no icon wrapper without an icon slot', () => {
    const wrapper = mount(AtsBadge, { slots: { default: 'Nhãn' } });

    expect(wrapper.find('.ats-badge__icon').exists()).toBe(false);
  });

  it('keeps the full text in title, so a truncated badge can still be read', () => {
    const root = mount(AtsBadge, { slots: { default: LONG_TEXT } }).get('.ats-badge');

    expect(root.attributes('title')).toBe(LONG_TEXT);
  });

  it('follows the text in title when the slot changes', async () => {
    const label = ref('Nhãn');
    const Host = defineComponent({
      render: () => h(AtsBadge, null, { default: () => label.value }),
    });
    const wrapper = mount(Host);
    expect(wrapper.get('.ats-badge').attributes('title')).toBe('Nhãn');

    label.value = LONG_TEXT;
    await nextTick();

    expect(wrapper.get('.ats-badge').attributes('title')).toBe(LONG_TEXT);
  });

  it('keeps a title passed by the caller', () => {
    const root = mount(AtsBadge, {
      attrs: { title: 'Trạng thái: Đã xác minh' },
      slots: { default: 'Đã xác minh' },
    }).get('.ats-badge');

    expect(root.attributes('title')).toBe('Trạng thái: Đã xác minh');
  });

  it('is not interactive: no tabindex, no role, not reachable with Tab', () => {
    const root = mount(AtsBadge, { slots: { default: 'Nhãn' } }).get('.ats-badge');

    expect(root.attributes('tabindex')).toBeUndefined();
    expect(root.attributes('role')).toBeUndefined();
    expect((root.element as HTMLElement).tabIndex).toBe(-1);
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsBadge.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        style,
      )?.[1] ?? '';

    it('is a 28 px pill with a 4/12 inset and a 4 px icon gap', () => {
      const base = rule('.ats-badge');
      expect(base).toMatch(/height:\s*28px/);
      expect(base).toMatch(/box-sizing:\s*border-box/);
      expect(base).toMatch(/padding:\s*var\(--space-1\)\s+var\(--space-3\)/);
      expect(base).toMatch(/gap:\s*var\(--space-1\)/);
      expect(base).toMatch(/border-radius:\s*var\(--radius-full\)/);
      expect(base).toMatch(/border:\s*1px solid/);
    });

    it('draws a 16 px icon box', () => {
      const icon = rule('.ats-badge__icon');
      expect(icon).toMatch(/width:\s*16px/);
      expect(icon).toMatch(/height:\s*16px/);
      expect(icon).toMatch(/flex-shrink:\s*0/);
    });

    it('never wraps and truncates long text with an ellipsis', () => {
      expect(rule('.ats-badge')).toMatch(/max-width:\s*100%/);
      const text = rule('.ats-badge__text');
      expect(text).toMatch(/white-space:\s*nowrap/);
      expect(text).toMatch(/overflow:\s*hidden/);
      expect(text).toMatch(/text-overflow:\s*ellipsis/);
    });

    it('gives every tone a border and fill from semantic tokens', () => {
      expect(rule('.ats-badge--neutral')).toMatch(/border-color:\s*var\(--color-line\)/);
      expect(rule('.ats-badge--neutral')).toMatch(/background:\s*var\(--color-surface\)/);
      expect(rule('.ats-badge--accent')).toMatch(/border-color:\s*var\(--color-accent\)/);
      expect(rule('.ats-badge--accent')).toMatch(/background:\s*var\(--color-accent\)/);
      expect(rule('.ats-badge--success')).toMatch(/border-color:\s*var\(--color-success-icon\)/);
      expect(rule('.ats-badge--success')).toMatch(/background:\s*var\(--color-success-surface\)/);
      expect(rule('.ats-badge--danger')).toMatch(/border-color:\s*var\(--color-danger\)/);
      expect(rule('.ats-badge--danger')).toMatch(/[^-]color:\s*var\(--color-danger\)/);
      expect(rule('.ats-badge--danger')).toMatch(/background:\s*var\(--color-error-surface\)/);
    });

    it('uses no raw colours', () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });
  });
});
