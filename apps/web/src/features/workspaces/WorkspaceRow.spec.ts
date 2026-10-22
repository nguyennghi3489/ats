import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import WorkspaceRow from './WorkspaceRow.vue';

function mountRow(props: { name?: string; disabled?: boolean } = {}) {
  return mount(WorkspaceRow, {
    props: { name: 'An Nhiên', ...props },
    attachTo: document.body,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WorkspaceRow', () => {
  it('is a button with the workspace name and a decorative arrow', () => {
    const wrapper = mountRow();
    const button = wrapper.get('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.text()).toContain('An Nhiên');
    expect(wrapper.get('[data-testid="workspace-row-arrow"]').attributes('aria-hidden')).toBe(
      'true',
    );
  });

  it('is reachable with the keyboard', () => {
    const wrapper = mountRow();
    const button = wrapper.get('button').element;

    button.focus();

    expect(document.activeElement).toBe(button);
    expect(button.tabIndex).toBe(0);
  });

  it('emits select on click', async () => {
    const wrapper = mountRow();

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('select')).toHaveLength(1);
  });

  it.each(['Enter', ' '])('emits select on %j', async (key) => {
    const wrapper = mountRow();

    await wrapper.get('button').trigger('keydown', { key });

    expect(wrapper.emitted('select')).toHaveLength(1);
  });

  it('ignores other keys', async () => {
    const wrapper = mountRow();

    await wrapper.get('button').trigger('keydown', { key: 'a' });

    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('emits nothing while disabled', async () => {
    const wrapper = mountRow({ disabled: true });
    const button = wrapper.get('button');

    await button.trigger('click');
    await button.trigger('keydown', { key: 'Enter' });

    expect(button.element.disabled).toBe(true);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
