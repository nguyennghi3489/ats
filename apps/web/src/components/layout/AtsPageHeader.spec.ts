// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsPageHeader from './AtsPageHeader.vue';

const TITLE = 'Vị trí tuyển dụng';
const DESCRIPTION = 'Quản lý tất cả vị trí tuyển dụng và theo dõi trạng thái đăng tuyển.';

describe('AtsPageHeader', () => {
  it('renders the title as the only h1, inside a header element', () => {
    const wrapper = mount(AtsPageHeader, { props: { title: TITLE } });

    const root = wrapper.get('header.ats-page-header');
    const headings = root.findAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe(TITLE);
    expect(headings[0]!.classes()).toContain('ats-page-header__title');
    expect(root.findAll('h2, h3, h4, h5, h6')).toHaveLength(0);
  });

  it('renders the description under the title when given', () => {
    const wrapper = mount(AtsPageHeader, { props: { title: TITLE, description: DESCRIPTION } });

    const heading = wrapper.get('.ats-page-header__heading');
    expect(Array.from(heading.element.children).map((el) => el.className)).toEqual([
      'ats-page-header__title',
      'ats-page-header__description',
    ]);
    expect(wrapper.get('.ats-page-header__description').text()).toBe(DESCRIPTION);
  });

  it('renders the actions slot after the heading in the title row', () => {
    const wrapper = mount(AtsPageHeader, {
      props: { title: TITLE },
      slots: { actions: () => h('button', { type: 'button' }, 'Tạo vị trí') },
    });

    const row = wrapper.get('.ats-page-header__row');
    expect(Array.from(row.element.children).map((el) => el.className)).toEqual([
      'ats-page-header__heading',
      'ats-page-header__actions',
    ]);
    expect(wrapper.get('.ats-page-header__actions button').text()).toBe('Tạo vị trí');
  });

  it('renders the breadcrumb slot above the title row', () => {
    const wrapper = mount(AtsPageHeader, {
      props: { title: 'Product Designer' },
      slots: { breadcrumb: () => h('a', { href: '#jobs' }, 'Vị trí tuyển dụng') },
    });

    const root = wrapper.get('.ats-page-header');
    expect(Array.from(root.element.children).map((el) => el.className)).toEqual([
      'ats-page-header__breadcrumb',
      'ats-page-header__row',
    ]);
    expect(wrapper.get('.ats-page-header__breadcrumb a').text()).toBe('Vị trí tuyển dụng');
  });

  it('renders nothing extra without description, actions or breadcrumb', () => {
    const wrapper = mount(AtsPageHeader, { props: { title: TITLE } });

    expect(wrapper.find('.ats-page-header__description').exists()).toBe(false);
    expect(wrapper.find('.ats-page-header__actions').exists()).toBe(false);
    expect(wrapper.find('.ats-page-header__breadcrumb').exists()).toBe(false);
    expect(wrapper.get('.ats-page-header__heading').element.children).toHaveLength(1);
    expect(wrapper.get('.ats-page-header').element.children).toHaveLength(1);
  });

  it('renders no description element for an empty description', () => {
    const wrapper = mount(AtsPageHeader, { props: { title: TITLE, description: '' } });

    expect(wrapper.find('.ats-page-header__description').exists()).toBe(false);
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(
      join(process.cwd(), 'src/components/layout/AtsPageHeader.vue'),
      'utf8',
    );
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const desktop = style.split('@media')[0] ?? '';
    const mobile = /@media \(max-width: 767px\)\s*\{([\s\S]*)\}\s*$/.exec(style)?.[1] ?? '';
    const rule = (css: string, selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        css,
      )?.[1] ?? '';

    it('draws the bottom border and the 32/40/24 inset on desktop', () => {
      const base = rule(desktop, '.ats-page-header');
      expect(base).toMatch(/border-bottom:\s*1px solid var\(--color-line\)/);
      expect(base).toMatch(/padding:\s*var\(--space-8\)\s+40px\s+var\(--space-6\)/);
      expect(base).toMatch(/box-sizing:\s*border-box/);
    });

    it('puts the actions on the right of the title row on desktop', () => {
      const row = rule(desktop, '.ats-page-header__row');
      expect(row).toMatch(/display:\s*flex/);
      expect(row).toMatch(/align-items:\s*center/);
      expect(row).toMatch(/justify-content:\s*space-between/);
      expect(row).toMatch(/gap:\s*var\(--space-/);
      expect(rule(desktop, '.ats-page-header__actions')).toMatch(/flex:\s*none/);
    });

    it('sets the page title type and wraps long titles instead of truncating', () => {
      const title = rule(desktop, '.ats-page-header__title');
      expect(title).toMatch(/font-size:\s*var\(--font-size-xl\)/);
      expect(title).toMatch(/line-height:\s*var\(--line-height-xl\)/);
      expect(title).toMatch(/font-weight:\s*var\(--font-weight-bold\)/);
      expect(title).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
      expect(style).not.toMatch(/text-overflow|white-space:\s*nowrap/);
      const heading = rule(desktop, '.ats-page-header__heading');
      expect(heading).toMatch(/min-width:\s*0/);
      expect(heading).toMatch(/flex:\s*1/);
    });

    it('sets the description in muted text', () => {
      const description = rule(desktop, '.ats-page-header__description');
      expect(description).toMatch(/[^-]color:\s*var\(--color-muted\)/);
      expect(description).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
    });

    it('below the mobile breakpoint narrows the inset, hides the description and stacks the actions full width', () => {
      const base = rule(mobile, '.ats-page-header');
      expect(base).toMatch(/padding:\s*var\(--space-6\)\s+20px\s+0/);
      expect(base).toMatch(/border-bottom:\s*0/);
      expect(rule(mobile, '.ats-page-header__description')).toMatch(/display:\s*none/);
      const row = rule(mobile, '.ats-page-header__row');
      expect(row).toMatch(/flex-direction:\s*column/);
      expect(row).toMatch(/align-items:\s*stretch/);
      const actions = rule(mobile, '.ats-page-header__actions');
      expect(actions).toMatch(/flex-direction:\s*column/);
      expect(actions).toMatch(/align-items:\s*stretch/);
    });

    it('below the mobile breakpoint takes the 18/24 title size (Example · Mobile navigation closed)', () => {
      const title = rule(mobile, '.ats-page-header__title');
      expect(title).toMatch(/font-size:\s*var\(--font-size-lg\)/);
      expect(title).toMatch(/line-height:\s*var\(--line-height-lg\)/);
    });

    it('stacks the actions under the title when the header itself is narrow, whatever the viewport', () => {
      expect(rule(desktop, '.ats-page-header')).toMatch(
        /container:\s*ats-page-header\s*\/\s*inline-size/,
      );
      const narrow =
        /@container ats-page-header \(max-width: \d+px\)\s*\{([\s\S]*?)\n\}/.exec(style)?.[1] ?? '';
      const row = rule(narrow, '.ats-page-header__row');
      expect(row).toMatch(/flex-direction:\s*column/);
      expect(row).toMatch(/align-items:\s*stretch/);
      const actions = rule(narrow, '.ats-page-header__actions');
      expect(actions).toMatch(/flex-direction:\s*column/);
      expect(actions).toMatch(/align-items:\s*stretch/);
      expect(rule(narrow, '.ats-page-header__title')).toMatch(/font-size:\s*var\(--font-size-lg\)/);
      expect(rule(narrow, '.ats-page-header__description')).toMatch(/display:\s*none/);
    });

    it('uses no raw colours', () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });
  });
});
