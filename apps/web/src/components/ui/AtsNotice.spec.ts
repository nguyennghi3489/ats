// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AtsIcon from './AtsIcon.vue';
import AtsNotice from './AtsNotice.vue';

const source = () => readFileSync(join(process.cwd(), 'src/components/ui/AtsNotice.vue'), 'utf8');
const style = () =>
  (/<style[^>]*>([\s\S]*)<\/style>/.exec(source())?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
/** The declarations of the rule whose selector is exactly `selector`. */
const rule = (selector: string) =>
  new RegExp(`(?:^|\\})\\s*${selector.replace(/[.-]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
    style(),
  )?.[1];

const message = 'Không thể lưu thay đổi. Kiểm tra nội dung rồi thử lại.';

describe('AtsNotice', () => {
  it('renders the title and the default slot as the message', () => {
    const wrapper = mount(AtsNotice, {
      props: { title: 'Cần xử lý' },
      slots: { default: message },
    });

    expect(wrapper.get('.ats-notice__title').text()).toBe('Cần xử lý');
    expect(wrapper.get('.ats-notice__message').text()).toBe(message);
  });

  it('defaults to the info tone, announced politely', () => {
    const notice = mount(AtsNotice, { slots: { default: message } }).get('.ats-notice');

    expect(notice.classes()).toContain('ats-notice--info');
    expect(notice.attributes('role')).toBe('status');
  });

  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['error', 'alert'],
  ] as const)('tone %s renders role="%s" and its own icon', (tone, role) => {
    const wrapper = mount(AtsNotice, {
      props: { tone, title: 'Thông tin' },
      slots: { default: message },
    });
    const notice = wrapper.get('.ats-notice');

    expect(notice.attributes('role')).toBe(role);
    expect(notice.classes()).toContain(`ats-notice--${tone}`);
    expect(wrapper.getComponent(AtsIcon).props('name')).toBe(tone);
  });

  it('draws the icon at 16 px and hides it from assistive technology', () => {
    const svg = mount(AtsNotice, {
      props: { tone: 'success' },
      slots: { default: message },
    }).get('svg');

    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.attributes('role')).toBeUndefined();
    expect([svg.attributes('width'), svg.attributes('height')]).toEqual(['16', '16']);
  });

  it('draws a different icon per tone', () => {
    const html = (['info', 'success', 'error'] as const).map((tone) =>
      mount(AtsNotice, { props: { tone } }).get('svg').html(),
    );

    expect(new Set(html).size).toBe(3);
  });

  it('without a title renders only the message', () => {
    const wrapper = mount(AtsNotice, { slots: { default: message } });

    expect(wrapper.find('.ats-notice__title').exists()).toBe(false);
    expect(wrapper.get('.ats-notice__copy').text()).toBe(message);
    expect(wrapper.get('.ats-notice__copy').element.children).toHaveLength(1);
  });

  it('holds no text of its own', () => {
    expect(mount(AtsNotice, { props: { tone: 'error' } }).text()).toBe('');
  });

  it('rejects an unknown tone at type level', () => {
    // @ts-expect-error 'warning' is not a tone; `pnpm typecheck` fails if this ever compiles.
    const wrapper = mount(AtsNotice, { props: { tone: 'warning' } });

    expect(wrapper.find('.ats-notice').exists()).toBe(true);
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    it('insets the content 12 px block and 16 px inline, with a 12 px icon/copy gap', () => {
      const base = rule('.ats-notice');

      expect(base).toMatch(/padding:\s*var\(--space-3\)\s+var\(--space-4\)/);
      expect(base).toMatch(/gap:\s*var\(--space-3\)/);
      expect(base).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    });

    it('keeps 4 px between title and message', () => {
      expect(rule('.ats-notice__copy')).toMatch(/gap:\s*var\(--space-1\)/);
    });

    it('wraps long text instead of clipping it', () => {
      const copy = rule('.ats-notice__copy');

      expect(copy).toMatch(/min-width:\s*0/);
      expect(copy).toMatch(/overflow-wrap:\s*anywhere/);
      expect(style()).not.toMatch(/overflow:\s*hidden|text-overflow|white-space:\s*nowrap/);
    });

    it('colours each tone from its notice tokens', () => {
      expect(rule('.ats-notice--info')).toMatch(/background:\s*var\(--color-info-surface\)/);
      expect(rule('.ats-notice--info')).toMatch(/color:\s*var\(--color-info-ink\)/);
      expect(rule('.ats-notice--success')).toMatch(/background:\s*var\(--color-success-surface\)/);
      expect(rule('.ats-notice--success')).toMatch(/color:\s*var\(--color-success-ink\)/);
      expect(rule('.ats-notice--success .ats-notice__icon')).toMatch(
        /color:\s*var\(--color-success-icon\)/,
      );
      expect(rule('.ats-notice--error')).toMatch(/background:\s*var\(--color-error-surface\)/);
      expect(rule('.ats-notice--error')).toMatch(/color:\s*var\(--color-danger\)/);
    });

    it('uses tokens only, never a raw colour', () => {
      expect(style()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
  });
});
