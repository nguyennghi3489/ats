// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import vi from '../../i18n/locales/vi.json';
import AuthLayout from './AuthLayout.vue';

const source = () => readFileSync(join(process.cwd(), 'src/features/auth/AuthLayout.vue'), 'utf8');

function mountLayout(slots: Record<string, string> = {}) {
  return mount(AuthLayout, {
    props: { title: 'Đăng nhập', subtitle: 'Tiếp tục vào tài khoản nhà tuyển dụng.' },
    slots: { default: '<form data-testid="sample-form">Biểu mẫu</form>', ...slots },
    global: { plugins: [i18n] },
  });
}

describe('AuthLayout', () => {
  beforeEach(() => {
    setLocale('vi');
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the brand header with the mark and the brand name', () => {
    const brand = mountLayout().get('[data-testid="auth-brand"]');

    expect(brand.get('.auth-layout__mark').text()).toBe('A');
    expect(brand.get('.auth-layout__mark').attributes('aria-hidden')).toBe('true');
    expect(brand.text()).toContain(vi.auth.layout.brand);
  });

  it('puts the language switch in the card header', () => {
    const header = mountLayout().get('.auth-layout__header');

    expect(header.find('[role="group"]').exists()).toBe(true);
    expect(header.findAll('[role="group"] button')).toHaveLength(2);
  });

  it('renders the title as the page heading and the subtitle under it', () => {
    const wrapper = mountLayout();

    expect(wrapper.get('h1').text()).toBe('Đăng nhập');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Tiếp tục vào tài khoản nhà tuyển dụng.',
    );
  });

  it('leaves out the subtitle when none is given', () => {
    const wrapper = mount(AuthLayout, {
      props: { title: 'Đăng nhập' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="auth-subtitle"]').exists()).toBe(false);
  });

  it('renders the default slot in the body and the footer slot below it', () => {
    const wrapper = mountLayout({ footer: '<a href="#" data-testid="sample-link">Đăng ký</a>' });

    expect(wrapper.get('.auth-layout__body [data-testid="sample-form"]').text()).toBe('Biểu mẫu');
    expect(wrapper.get('.auth-layout__footer [data-testid="sample-link"]').text()).toBe('Đăng ký');
  });

  it('has no footer element without a footer slot', () => {
    expect(mountLayout().find('.auth-layout__footer').exists()).toBe(false);
  });

  it('shows the brand name in English after switching to EN', async () => {
    const wrapper = mountLayout();

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.get('[data-testid="auth-brand"]').text()).toContain(en.auth.layout.brand);
    expect(document.documentElement.lang).toBe('en');
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    it('centres a card of at most 448 px on the canvas', () => {
      const css = source();

      expect(css).toMatch(/\.auth-layout\s*\{[^}]*background:\s*var\(--color-canvas\)/);
      expect(css).toMatch(/\.auth-layout\s*\{[^}]*place-items:\s*center/);
      expect(css).toMatch(/\.auth-layout__card\s*\{[^}]*max-width:\s*448px/);
      expect(css).toMatch(/\.auth-layout__card\s*\{[^}]*width:\s*100%/);
    });

    it('uses tokens only, never a raw colour', () => {
      const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source())?.[1] ?? '';

      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
  });
});
