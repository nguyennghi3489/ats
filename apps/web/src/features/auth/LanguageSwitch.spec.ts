// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { i18n, LOCALE_STORAGE_KEY, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import vi from '../../i18n/locales/vi.json';
import LanguageSwitch from './LanguageSwitch.vue';

const source = () =>
  readFileSync(join(process.cwd(), 'src/features/auth/LanguageSwitch.vue'), 'utf8');

function mountSwitch() {
  return mount(LanguageSwitch, { global: { plugins: [i18n] }, attachTo: document.body });
}

describe('LanguageSwitch', () => {
  beforeEach(() => {
    setLocale('vi');
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('is a labelled group of two buttons, VI then EN', () => {
    const group = mountSwitch().get('[role="group"]');

    expect(group.attributes('aria-label')).toBe(vi.auth.layout.language);
    const buttons = group.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual([vi.auth.layout.vi, vi.auth.layout.en]);
    for (const button of buttons) expect(button.attributes('type')).toBe('button');
    expect(buttons[0]!.attributes('aria-label')).toBe(vi.auth.layout.viName);
    expect(buttons[1]!.attributes('aria-label')).toBe(vi.auth.layout.enName);
    expect(buttons[0]!.attributes('lang')).toBe('vi');
    expect(buttons[1]!.attributes('lang')).toBe('en');
  });

  it('marks the active language as pressed', () => {
    const buttons = mountSwitch().findAll('button');

    expect(buttons[0]!.attributes('aria-pressed')).toBe('true');
    expect(buttons[1]!.attributes('aria-pressed')).toBe('false');
  });

  it('clicking EN switches i18n, <html lang>, the stored choice and the pressed state', async () => {
    const wrapper = mountSwitch();

    await wrapper.findAll('button')[1]!.trigger('click');

    expect(i18n.global.locale.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    const buttons = wrapper.findAll('button');
    expect(buttons[0]!.attributes('aria-pressed')).toBe('false');
    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe(en.auth.layout.language);
  });

  it('clicking VI switches back', async () => {
    setLocale('en');
    const wrapper = mountSwitch();

    await wrapper.findAll('button')[0]!.trigger('click');

    expect(i18n.global.locale.value).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi');
  });

  it('both options are native, enabled buttons, so they are reachable by keyboard', () => {
    const wrapper = mountSwitch();

    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeUndefined();
      expect(button.attributes('tabindex')).toBeUndefined();
      (button.element as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(button.element);
    }
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    it('draws the focus ring with the focus tokens', () => {
      const focus = /:focus-visible[^{]*\{([^}]*)\}/.exec(source())?.[1];

      expect(focus).toMatch(
        /outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--color-focus-ring\)/,
      );
    });

    it('meets the touch target on mobile', () => {
      const mobile = /@media\s*\(max-width:\s*767px\)\s*\{([\s\S]*?)\}\s*\}/.exec(source())?.[1];

      expect(mobile).toMatch(/min-height:\s*var\(--touch-target-min\)/);
    });

    it('uses tokens only, never a raw colour', () => {
      const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source())?.[1] ?? '';

      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
  });
});
