// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount, type DOMWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsIconButton from './AtsIconButton.vue';

const source = () =>
  readFileSync(join(process.cwd(), 'src/components/ui/AtsIconButton.vue'), 'utf8');

/**
 * The equivalent of `getByRole('button', { name })`: a button (native or role="button") whose
 * accessible name, here its aria-label or else its text, is `name`.
 */
function getByRole(root: { findAll: (s: string) => DOMWrapper<Element>[] }, name: string) {
  const matches = root
    .findAll('button, [role="button"]')
    .filter((el) => (el.attributes('aria-label') ?? el.text()).trim() === name);
  if (matches.length !== 1) throw new Error(`expected one button named "${name}"`);
  return matches[0]!;
}

describe('AtsIconButton', () => {
  it('is found by role and accessible name, and renders no visible text', () => {
    const wrapper = mount(AtsIconButton, { props: { icon: 'trash', label: 'Xóa' } });
    const button = getByRole(wrapper, 'Xóa');

    expect(button.element.tagName).toBe('BUTTON');
    expect(button.text()).toBe('');
    expect(button.attributes('title')).toBe('Xóa');
  });

  it('draws the requested icon, decorative, at 16 px', () => {
    const svg = mount(AtsIconButton, { props: { icon: 'edit', label: 'Sửa' } }).get('svg');

    expect(svg.classes()).toContain('ats-icon');
    expect(svg.classes()).not.toContain('ats-icon--spin');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect([svg.attributes('width'), svg.attributes('height')]).toEqual(['16', '16']);
  });

  it('draws a different icon for a different name', () => {
    const trash = mount(AtsIconButton, { props: { icon: 'trash', label: 'Xóa' } }).html();
    const close = mount(AtsIconButton, { props: { icon: 'close', label: 'Đóng' } }).html();

    expect(trash).not.toBe(close);
  });

  it('requires a label and a known icon name', () => {
    // @ts-expect-error `label` is required; `pnpm typecheck` fails if this ever compiles.
    const unlabelled = mount(AtsIconButton, { props: { icon: 'trash' } });
    // @ts-expect-error 'banana' is not an IconName.
    const unknown = mount(AtsIconButton, { props: { icon: 'banana', label: 'Xóa' } });

    expect(unlabelled.find('button').exists()).toBe(true);
    expect(unknown.find('path').exists()).toBe(false);
  });

  it('emits click when activated', async () => {
    const wrapper = mount(AtsIconButton, { props: { icon: 'trash', label: 'Xóa' } });

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')![0]![0]).toBeInstanceOf(Event);
  });

  it('defaults type to button, so it does not submit a surrounding form', async () => {
    let submits = 0;
    const wrapper = mount(
      {
        render: () =>
          h('form', { onSubmit: (e: Event) => (e.preventDefault(), submits++) }, [
            h(AtsIconButton, { icon: 'trash', label: 'Xóa' }),
          ]),
      },
      { attachTo: document.body },
    );

    expect(wrapper.get('button').attributes('type')).toBe('button');
    await wrapper.get('button').trigger('click');
    expect(submits).toBe(0);
    wrapper.unmount();
  });

  it('submits the form when type is submit', async () => {
    let submits = 0;
    const wrapper = mount(
      {
        render: () =>
          h('form', { onSubmit: (e: Event) => (e.preventDefault(), submits++) }, [
            h(AtsIconButton, { icon: 'close', label: 'Đóng', type: 'submit' }),
          ]),
      },
      { attachTo: document.body },
    );

    expect(wrapper.get('button').attributes('type')).toBe('submit');
    await wrapper.get('button').trigger('click');
    expect(submits).toBe(1);
    wrapper.unmount();
  });

  describe('pending', () => {
    it('swaps the icon for the spinner and sets aria-busy, keeping its name', () => {
      const wrapper = mount(AtsIconButton, {
        props: { icon: 'trash', label: 'Xóa', pending: true },
      });
      const button = getByRole(wrapper, 'Xóa');
      const icons = button.findAll('svg');

      expect(button.attributes('aria-busy')).toBe('true');
      expect(icons).toHaveLength(1);
      expect(icons[0]!.classes()).toContain('ats-icon--spin');
      expect(icons[0]!.attributes('aria-hidden')).toBe('true');
      expect(button.text()).toBe('');
    });

    it('has no aria-busy when idle', () => {
      const button = mount(AtsIconButton, { props: { icon: 'trash', label: 'Xóa' } }).get('button');

      expect(button.attributes('aria-busy')).toBeUndefined();
    });

    it('emits no click, however many times it is clicked', async () => {
      const wrapper = mount(AtsIconButton, {
        props: { icon: 'trash', label: 'Xóa', pending: true },
      });

      await wrapper.get('button').trigger('click');
      await wrapper.get('button').trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('does not submit its form', async () => {
      let submits = 0;
      const wrapper = mount(
        {
          render: () =>
            h('form', { onSubmit: (e: Event) => (e.preventDefault(), submits++) }, [
              h(AtsIconButton, { icon: 'close', label: 'Đóng', type: 'submit', pending: true }),
            ]),
        },
        { attachTo: document.body },
      );

      await wrapper.get('button').trigger('click');

      expect(submits).toBe(0);
      wrapper.unmount();
    });

    it('stays focusable and keeps focus while pending', async () => {
      const wrapper = mount(AtsIconButton, {
        props: { icon: 'trash', label: 'Xóa' },
        attachTo: document.body,
      });
      const button = wrapper.get('button');

      (button.element as HTMLButtonElement).focus();
      await wrapper.setProps({ pending: true });

      expect(button.attributes('disabled')).toBeUndefined();
      expect(document.activeElement).toBe(button.element);
      wrapper.unmount();
    });
  });

  describe('disabled', () => {
    it('is a disabled native button, so it cannot take focus', () => {
      const wrapper = mount(AtsIconButton, {
        props: { icon: 'trash', label: 'Xóa', disabled: true },
        attachTo: document.body,
      });
      const button = wrapper.get('button');

      expect(button.attributes('disabled')).toBeDefined();
      (button.element as HTMLButtonElement).focus();
      expect(document.activeElement).not.toBe(button.element);
      wrapper.unmount();
    });

    it('emits no click', async () => {
      const wrapper = mount(AtsIconButton, {
        props: { icon: 'trash', label: 'Xóa', disabled: true },
      });

      await wrapper.get('button').trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    it('is a 36 px square on desktop and the 44 px touch target below the mobile breakpoint', () => {
      const css = source();
      const base = /\.ats-icon-button\s*\{([^}]*)\}/.exec(css)?.[1];
      const mobile = /@media\s*\(max-width:\s*767px\)\s*\{([\s\S]*?)\}\s*\}/.exec(css)?.[1];

      expect(base).toMatch(/width:\s*36px/);
      expect(base).toMatch(/height:\s*36px/);
      expect(base).toMatch(/box-sizing:\s*border-box/);
      expect(mobile).toMatch(/width:\s*var\(--touch-target-min\)/);
      expect(mobile).toMatch(/height:\s*var\(--touch-target-min\)/);
    });

    it('draws the focus ring 3 px inside the box, so the size never changes', () => {
      const focus = /\.ats-icon-button:focus-visible[^{]*\{([^}]*)\}/.exec(source())?.[1];

      expect(focus).toMatch(
        /outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--color-focus-ring\)/,
      );
      expect(focus).toMatch(/outline-offset:\s*calc\(-1\s*\*\s*var\(--focus-ring-width\)\)/);
      expect(focus).not.toMatch(/border-width|padding|width:|height:/);
    });

    it('fades the disabled state with the disabled opacity token', () => {
      expect(source()).toMatch(
        /\.ats-icon-button:disabled\s*\{[^}]*opacity:\s*var\(--opacity-disabled\)/,
      );
    });

    it('uses tokens only, never a raw colour', () => {
      const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source())?.[1] ?? '';

      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
  });
});
