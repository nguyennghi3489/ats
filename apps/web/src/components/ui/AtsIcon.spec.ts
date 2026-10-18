// Node types for this spec only: one test reads the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AtsIcon from './AtsIcon.vue';
import { ICON_NAMES, type IconName } from './icons';

// The 11 masters on the design page "01 · Foundations" (ATS/Icon/*).
const DESIGN_ICONS: IconName[] = [
  'archive-box',
  'chevron-down',
  'close',
  'edit',
  'empty',
  'error',
  'info',
  'profile',
  'spinner',
  'success',
  'trash',
];

describe('AtsIcon', () => {
  it('ships exactly the icons drawn in the design', () => {
    expect([...ICON_NAMES].sort()).toEqual(DESIGN_ICONS);
  });

  it('hides a decorative icon from assistive technology', () => {
    const svg = mount(AtsIcon, { props: { name: 'trash' } }).get('svg');

    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.attributes('role')).toBeUndefined();
    expect(svg.attributes('aria-label')).toBeUndefined();
  });

  it('exposes a labelled icon as an image with that name', () => {
    const svg = mount(AtsIcon, { props: { name: 'trash', label: 'Xóa' } }).get('svg');

    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('Xóa');
    expect(svg.attributes('aria-hidden')).toBeUndefined();
  });

  it('is 16 px by default and follows the size prop', () => {
    const small = mount(AtsIcon, { props: { name: 'close' } }).get('svg');
    const large = mount(AtsIcon, { props: { name: 'empty', size: 32 } }).get('svg');

    expect([small.attributes('width'), small.attributes('height')]).toEqual(['16', '16']);
    expect([large.attributes('width'), large.attributes('height')]).toEqual(['32', '32']);
  });

  it.each(DESIGN_ICONS)('draws %s in currentColor, never a fixed colour', (name) => {
    const html = mount(AtsIcon, { props: { name } }).html();

    expect(html).toContain('stroke="currentColor"');
    expect(html).toMatch(/<path\b/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });

  it('marks only the spinner as spinning', () => {
    const spinner = mount(AtsIcon, { props: { name: 'spinner' } }).get('svg');
    const trash = mount(AtsIcon, { props: { name: 'trash' } }).get('svg');

    expect(spinner.classes()).toContain('ats-icon--spin');
    expect(trash.classes()).not.toContain('ats-icon--spin');
  });

  it('stops the spinner under prefers-reduced-motion: reduce', () => {
    // happy-dom does not run CSS animations, so the stylesheet rule itself is checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsIcon.vue'), 'utf8');
    const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/.exec(
      source,
    );

    expect(source).toMatch(/\.ats-icon--spin\s*\{[^}]*animation:/);
    expect(reduced?.[1]).toMatch(/\.ats-icon--spin\s*\{[^}]*animation:\s*none/);
  });

  it('accepts only known icon names', () => {
    // @ts-expect-error 'banana' is not an IconName; `pnpm typecheck` fails if this ever compiles.
    const wrapper = mount(AtsIcon, { props: { name: 'banana' } });

    expect(wrapper.find('path').exists()).toBe(false);
  });
});
