// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsButton from './AtsButton.vue';
import AtsEmptyState from './AtsEmptyState.vue';
import AtsIcon from './AtsIcon.vue';

const TITLE = 'Không có kết quả phù hợp';
const DESCRIPTION = 'Thử thay đổi từ khóa hoặc bộ lọc để tìm nội dung phù hợp.';

describe('AtsEmptyState', () => {
  it('renders the title as an h2 by default and the description below it', () => {
    const root = mount(AtsEmptyState, {
      props: { title: TITLE, description: DESCRIPTION },
    }).get('.ats-empty-state');

    const heading = root.get('h2');
    expect(heading.text()).toBe(TITLE);
    expect(heading.classes()).toContain('ats-empty-state__title');
    expect(root.get('.ats-empty-state__description').text()).toBe(DESCRIPTION);
    expect(root.findAll('h1, h3, h4, h5, h6')).toHaveLength(0);
  });

  it.each([1, 3, 4, 5, 6] as const)('renders the title as an h%i when asked', (level) => {
    const root = mount(AtsEmptyState, {
      props: { title: TITLE, headingLevel: level },
    }).get('.ats-empty-state');

    expect(root.get(`h${level}`).text()).toBe(TITLE);
    expect(root.find('h2').exists()).toBe(false);
  });

  it('renders no description element without a description', () => {
    const wrapper = mount(AtsEmptyState, { props: { title: TITLE } });

    expect(wrapper.find('.ats-empty-state__description').exists()).toBe(false);
  });

  it('shows the empty icon by default, at 32 px and hidden from assistive technology', () => {
    const wrapper = mount(AtsEmptyState, { props: { title: TITLE } });

    const surface = wrapper.get('.ats-empty-state__icon');
    expect(surface.attributes('aria-hidden')).toBe('true');
    const icon = wrapper.getComponent(AtsIcon);
    expect(icon.props('name')).toBe('empty');
    expect(icon.props('size')).toBe(32);
    expect(icon.props('label')).toBeUndefined();
    expect(icon.attributes('aria-hidden')).toBe('true');
  });

  it('shows another icon when asked', () => {
    const wrapper = mount(AtsEmptyState, { props: { title: TITLE, icon: 'archive-box' } });

    expect(wrapper.getComponent(AtsIcon).props('name')).toBe('archive-box');
  });

  it('renders an action button from actionLabel and emits action when clicked', async () => {
    const wrapper = mount(AtsEmptyState, {
      props: { title: TITLE, actionLabel: 'Xóa bộ lọc' },
    });

    const button = wrapper.getComponent(AtsButton);
    expect(button.text()).toBe('Xóa bộ lọc');
    expect(button.props('type')).toBe('button');

    await button.trigger('click');

    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('renders the action slot instead of the convenience button', async () => {
    let clicks = 0;
    const wrapper = mount(AtsEmptyState, {
      props: { title: TITLE, actionLabel: 'Bị bỏ qua' },
      slots: {
        action: () => h(AtsButton, { onClick: () => clicks++ }, () => 'Tạo nội dung'),
      },
    });

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.text()).toBe('Tạo nội dung');
    await buttons[0]!.trigger('click');
    expect(clicks).toBe(1);
    expect(wrapper.emitted('action')).toBeUndefined();
  });

  it('renders no button and no action wrapper without actionLabel or action slot', () => {
    const wrapper = mount(AtsEmptyState, { props: { title: TITLE, description: DESCRIPTION } });

    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('.ats-empty-state__action').exists()).toBe(false);
  });

  it('puts icon, title, description and action in that order', () => {
    const root = mount(AtsEmptyState, {
      props: { title: TITLE, description: DESCRIPTION, actionLabel: 'Xóa bộ lọc' },
    }).get('.ats-empty-state');

    expect(Array.from(root.element.children).map((el) => el.className)).toEqual([
      'ats-empty-state__icon',
      'ats-empty-state__title',
      'ats-empty-state__description',
      'ats-empty-state__action',
    ]);
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsEmptyState.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const desktop = style.split('@media')[0] ?? '';
    const mobile = /@media \(max-width: 767px\)\s*\{([\s\S]*)\}\s*$/.exec(style)?.[1] ?? '';
    const rule = (css: string, selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        css,
      )?.[1] ?? '';

    it('centres the content with a 12 px vertical gap and a 28/48 inset on desktop', () => {
      const base = rule(desktop, '.ats-empty-state');
      expect(base).toMatch(/display:\s*flex/);
      expect(base).toMatch(/flex-direction:\s*column/);
      expect(base).toMatch(/align-items:\s*center/);
      expect(base).toMatch(/text-align:\s*center/);
      expect(base).toMatch(/gap:\s*var\(--space-3\)/);
      expect(base).toMatch(/padding:\s*28px\s+48px/);
    });

    it('narrows the side inset to 20 px below the mobile breakpoint', () => {
      expect(rule(mobile, '.ats-empty-state')).toMatch(/padding:\s*28px\s+20px/);
    });

    it('draws a 64 px icon surface in the accent fill', () => {
      const icon = rule(desktop, '.ats-empty-state__icon');
      expect(icon).toMatch(/width:\s*64px/);
      expect(icon).toMatch(/height:\s*64px/);
      expect(icon).toMatch(/background:\s*var\(--color-accent\)/);
      expect(icon).toMatch(/flex-shrink:\s*0/);
    });

    it('sets the title in ink and the description in muted text', () => {
      expect(rule(desktop, '.ats-empty-state__title')).toMatch(/[^-]color:\s*var\(--color-ink\)/);
      expect(rule(desktop, '.ats-empty-state__title')).toMatch(/margin:\s*0/);
      expect(rule(desktop, '.ats-empty-state__description')).toMatch(
        /[^-]color:\s*var\(--color-muted\)/,
      );
      expect(rule(desktop, '.ats-empty-state__description')).toMatch(/margin:\s*0/);
    });

    it('wraps long copy inside a readable width instead of scrolling sideways', () => {
      for (const selector of ['.ats-empty-state__title', '.ats-empty-state__description']) {
        const text = rule(desktop, selector);
        expect(text).toMatch(/max-width:\s*\d+px/);
        expect(text).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
      }
      expect(rule(desktop, '.ats-empty-state')).toMatch(/min-width:\s*0/);
      expect(rule(desktop, '.ats-empty-state')).toMatch(/box-sizing:\s*border-box/);
    });

    it('uses no raw colours', () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });
  });
});
