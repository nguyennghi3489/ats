// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsPageBody from './AtsPageBody.vue';

describe('AtsPageBody', () => {
  it('renders the default slot in the padded default variant', () => {
    const wrapper = mount(AtsPageBody, { slots: { default: () => h('p', 'Nội dung') } });

    const root = wrapper.get('.ats-page-body');
    expect(root.classes()).toEqual(['ats-page-body', 'ats-page-body--default']);
    expect(root.get('p').text()).toBe('Nội dung');
  });

  it.each(['default', 'flush', 'centered'] as const)('applies the %s variant', (variant) => {
    const wrapper = mount(AtsPageBody, { props: { variant } });

    const root = wrapper.get('.ats-page-body');
    expect(root.classes()).toContain(`ats-page-body--${variant}`);
    expect(root.classes().filter((c) => c.startsWith('ats-page-body--'))).toEqual([
      `ats-page-body--${variant}`,
    ]);
  });

  it('adds no heading or landmark of its own', () => {
    const wrapper = mount(AtsPageBody);

    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.element.children).toHaveLength(0);
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(
      join(process.cwd(), 'src/components/layout/AtsPageBody.vue'),
      'utf8',
    );
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const desktop = style.split('@media')[0] ?? '';
    const mobile = /@media \(max-width: 767px\)\s*\{([\s\S]*)\}\s*$/.exec(style)?.[1] ?? '';
    const rule = (css: string, selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        css,
      )?.[1] ?? '';

    it('keeps the body shrinkable and box-sized', () => {
      const base = rule(desktop, '.ats-page-body');
      expect(base).toMatch(/min-width:\s*0/);
      expect(base).toMatch(/box-sizing:\s*border-box/);
    });

    it('pads the default variant with the 40 px page sides, 20 px below the mobile breakpoint', () => {
      expect(rule(desktop, '.ats-page-body--default')).toMatch(
        /padding:\s*var\(--space-6\)\s+40px/,
      );
      expect(rule(mobile, '.ats-page-body--default')).toMatch(/padding:\s*20px/);
    });

    it('leaves the flush variant edge to edge', () => {
      expect(rule(desktop, '.ats-page-body--flush')).toMatch(/padding:\s*0/);
    });

    it('lines the first and last table columns of a flush body up with the page sides', () => {
      // ATS/Page wrapper, Example · Desktop list: "VỊ TRÍ" and "Product Designer" start on the
      // title's 40 px line (20 px on mobile) while the row lines still run edge to edge.
      const first = '.ats-page-body--flush :deep(:is(th, td):first-child)';
      const last = '.ats-page-body--flush :deep(:is(th, td):last-child)';
      expect(rule(desktop, first)).toMatch(/padding-inline-start:\s*40px/);
      expect(rule(desktop, last)).toMatch(/padding-inline-end:\s*40px/);
      expect(rule(mobile, first)).toMatch(/padding-inline-start:\s*20px/);
      expect(rule(mobile, last)).toMatch(/padding-inline-end:\s*20px/);
    });

    it('centres the content of the centered variant both ways', () => {
      const centered = rule(desktop, '.ats-page-body--centered');
      expect(centered).toMatch(/display:\s*flex/);
      expect(centered).toMatch(/flex-direction:\s*column/);
      expect(centered).toMatch(/align-items:\s*center/);
      expect(centered).toMatch(/justify-content:\s*center/);
      expect(centered).toMatch(/flex:\s*1/);
      expect(centered).toMatch(/padding:\s*var\(--space-8\)\s+40px/);
      expect(rule(mobile, '.ats-page-body--centered')).toMatch(
        /padding:\s*var\(--space-8\)\s+20px/,
      );
    });

    it('uses no raw colours', () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });
  });
});
