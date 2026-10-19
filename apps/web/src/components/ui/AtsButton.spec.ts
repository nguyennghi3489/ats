// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsButton from './AtsButton.vue';

const source = () => readFileSync(join(process.cwd(), 'src/components/ui/AtsButton.vue'), 'utf8');

describe('AtsButton', () => {
  it('renders the slot as its label, as a primary button by default', () => {
    const button = mount(AtsButton, { slots: { default: 'Lưu thay đổi' } }).get('button');

    expect(button.text()).toBe('Lưu thay đổi');
    expect(button.classes()).toContain('ats-button--primary');
    expect(button.classes()).not.toContain('ats-button--outline');
  });

  it('switches to the outline style', () => {
    const button = mount(AtsButton, {
      props: { variant: 'outline' },
      slots: { default: 'Hủy' },
    }).get('button');

    expect(button.classes()).toContain('ats-button--outline');
    expect(button.classes()).not.toContain('ats-button--primary');
  });

  it('emits click when activated', async () => {
    const wrapper = mount(AtsButton, { slots: { default: 'Lưu' } });

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
            h(AtsButton, null, () => 'Lưu'),
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
            h(AtsButton, { type: 'submit' }, () => 'Lưu'),
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
    it('is busy, shows the spinner before the label and keeps the label as passed', () => {
      const button = mount(AtsButton, {
        props: { pending: true },
        slots: { default: 'Đang lưu' },
      }).get('button');

      expect(button.attributes('aria-busy')).toBe('true');
      const spinner = button.get('svg.ats-icon');
      expect(spinner.classes()).toContain('ats-icon--spin');
      expect(spinner.attributes('aria-hidden')).toBe('true');
      expect(button.element.firstElementChild).toBe(spinner.element);
      expect(button.text()).toBe('Đang lưu');
    });

    it('has no spinner and no aria-busy when idle', () => {
      const button = mount(AtsButton, { slots: { default: 'Lưu' } }).get('button');

      expect(button.attributes('aria-busy')).toBeUndefined();
      expect(button.find('svg').exists()).toBe(false);
    });

    it('emits no click, however many times it is clicked', async () => {
      const wrapper = mount(AtsButton, { props: { pending: true }, slots: { default: 'Lưu' } });

      await wrapper.get('button').trigger('click');
      await wrapper.get('button').trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('does not submit its form a second time', async () => {
      let submits = 0;
      const wrapper = mount(
        {
          render: () =>
            h('form', { onSubmit: (e: Event) => (e.preventDefault(), submits++) }, [
              h(AtsButton, { type: 'submit', pending: true }, () => 'Đang lưu'),
            ]),
        },
        { attachTo: document.body },
      );

      await wrapper.get('button').trigger('click');
      await wrapper.get('button').trigger('click');

      expect(submits).toBe(0);
      wrapper.unmount();
    });

    it('stays focusable and keeps focus while pending', async () => {
      const wrapper = mount(AtsButton, { slots: { default: 'Lưu' }, attachTo: document.body });
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
      const wrapper = mount(AtsButton, {
        props: { disabled: true },
        slots: { default: 'Lưu' },
        attachTo: document.body,
      });
      const button = wrapper.get('button');

      expect(button.attributes('disabled')).toBeDefined();
      (button.element as HTMLButtonElement).focus();
      expect(document.activeElement).not.toBe(button.element);
      wrapper.unmount();
    });

    it('emits no click', async () => {
      const wrapper = mount(AtsButton, { props: { disabled: true }, slots: { default: 'Lưu' } });

      await wrapper.get('button').trigger('click');

      expect(wrapper.emitted('click')).toBeUndefined();
    });
  });

  it('stretches to full width with block', () => {
    const block = mount(AtsButton, { props: { block: true } }).get('button');
    const inline = mount(AtsButton).get('button');

    expect(block.classes()).toContain('ats-button--block');
    expect(inline.classes()).not.toContain('ats-button--block');
  });

  it('passes attributes such as aria-label through to the button', () => {
    const button = mount(AtsButton, { attrs: { 'aria-label': 'Lưu ứng viên' } }).get('button');

    expect(button.attributes('aria-label')).toBe('Lưu ứng viên');
  });

  // happy-dom does not apply component CSS, so the stylesheet rules themselves are checked.
  describe('stylesheet', () => {
    it('draws the focus ring 3 px inside the button', () => {
      const focus = /\.ats-button:focus-visible[^{]*\{([^}]*)\}/.exec(source())?.[1];

      expect(focus).toMatch(
        /outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--color-focus-ring\)/,
      );
      expect(focus).toMatch(/outline-offset:\s*calc\(-1\s*\*\s*var\(--focus-ring-width\)\)/);
    });

    it('is 36 px high on desktop and at least the touch target on mobile, wrapping centred', () => {
      const css = source();
      const mobile = /@media\s*\(max-width:\s*767px\)\s*\{([\s\S]*?)\}\s*\}/.exec(css)?.[1];

      expect(css).toMatch(/\.ats-button\s*\{[^}]*min-height:\s*36px/);
      expect(mobile).toMatch(/min-height:\s*var\(--touch-target-min\)/);
      expect(mobile).toMatch(/white-space:\s*normal/);
      expect(css).toMatch(/\.ats-button\s*\{[^}]*text-align:\s*center/);
    });

    it('fades the disabled state with the disabled opacity token', () => {
      expect(source()).toMatch(
        /\.ats-button:disabled\s*\{[^}]*opacity:\s*var\(--opacity-disabled\)/,
      );
    });

    it('uses tokens only, never a raw colour', () => {
      const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source())?.[1] ?? '';

      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    });
  });
});
