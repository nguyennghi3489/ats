import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import AtsField from './AtsField.vue';

interface SlotProps {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

// Renders a plain <input> wired the way AtsField asks a control to be wired.
function mountField(props: Record<string, unknown>) {
  let exposed: SlotProps | undefined;
  const wrapper = mount(AtsField, {
    props: { label: 'Tên ứng viên', ...props },
    slots: {
      default: (slot: SlotProps) => {
        exposed = slot;
        return h('input', {
          id: slot.controlId,
          'aria-describedby': slot.describedBy,
          'aria-invalid': slot.invalid ? 'true' : undefined,
          'aria-required': slot.required ? 'true' : undefined,
        });
      },
    },
  });
  return { wrapper, slot: () => exposed! };
}

describe('AtsField', () => {
  it('labels the control through a generated id when none is given', () => {
    const { wrapper, slot } = mountField({});
    const label = wrapper.get('label');

    expect(slot().controlId).toMatch(/\S/);
    expect(label.attributes('for')).toBe(slot().controlId);
    expect(wrapper.get('input').attributes('id')).toBe(slot().controlId);
    expect(label.text()).toBe('Tên ứng viên');
  });

  it('gives each field on a page its own id', () => {
    const ids: string[] = [];
    const field = () =>
      h(
        AtsField,
        { label: 'Tên ứng viên' },
        {
          default: (slot: SlotProps) => {
            ids.push(slot.controlId);
            return h('input', { id: slot.controlId });
          },
        },
      );
    mount({ render: () => h('form', [field(), field()]) });

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('uses the id prop for the control', () => {
    const { wrapper, slot } = mountField({ id: 'candidate-name' });

    expect(slot().controlId).toBe('candidate-name');
    expect(wrapper.get('label').attributes('for')).toBe('candidate-name');
  });

  it('describes the control with the helper text', () => {
    const { wrapper, slot } = mountField({
      helper: 'Thông tin này được dùng trong hồ sơ chia sẻ.',
    });
    const helper = wrapper.get(`#${slot().describedBy}`);

    expect(helper.text()).toBe('Thông tin này được dùng trong hồ sơ chia sẻ.');
    expect(slot().invalid).toBe(false);
  });

  it('has no description when there is neither helper nor error text', () => {
    const { wrapper, slot } = mountField({});

    expect(slot().describedBy).toBeUndefined();
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined();
  });

  it('shows the error text instead of the helper text and marks the control invalid', () => {
    const { wrapper, slot } = mountField({
      helper: 'Thông tin này được dùng trong hồ sơ chia sẻ.',
      error: 'Vui lòng kiểm tra nội dung đã nhập',
    });

    expect(slot().invalid).toBe(true);
    expect(wrapper.get(`#${slot().describedBy}`).text()).toBe('Vui lòng kiểm tra nội dung đã nhập');
    expect(wrapper.text()).not.toContain('Thông tin này được dùng trong hồ sơ chia sẻ.');
    expect(wrapper.classes()).toContain('ats-field--error');
  });

  it('shows a required marker that is not part of the accessible label text', () => {
    const { wrapper, slot } = mountField({ required: true });
    const marker = wrapper.get('label [aria-hidden="true"]');

    expect(marker.text()).toBe('*');
    expect(slot().required).toBe(true);
    expect(wrapper.get('input').attributes('aria-required')).toBe('true');
  });

  it('shows no required marker on an optional field', () => {
    const { wrapper, slot } = mountField({});

    expect(wrapper.find('label [aria-hidden="true"]').exists()).toBe(false);
    expect(slot().required).toBe(false);
  });

  it('dims the whole field when disabled', () => {
    const { wrapper, slot } = mountField({ disabled: true });

    expect(wrapper.classes()).toContain('ats-field--disabled');
    expect(slot().disabled).toBe(true);
  });
});
