// Node types for this spec only: the sizing tests read the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import AtsTextField from './AtsTextField.vue';

const LABEL = 'Tên ứng viên';
const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra nội dung đã nhập';

type Props = InstanceType<typeof AtsTextField>['$props'];

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountTextField(props: Partial<Props> = {}) {
  const wrapper = mount(AtsTextField, {
    props: { label: LABEL, modelValue: '', ...props },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

/**
 * Testing Library's getByLabelText, reduced to what these specs need: the <label> whose text, minus
 * decorative (aria-hidden) parts, equals `text`, and the control its `for` points at.
 */
function getByLabelText(text: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find((candidate) => {
    const copy = candidate.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return copy.textContent?.trim() === text;
  });
  if (!label) throw new Error(`No label with text "${text}"`);
  const control = document.getElementById(label.htmlFor);
  if (!(control instanceof HTMLInputElement)) throw new Error(`Label "${text}" labels no input`);
  return control;
}

const describedBy = (input: HTMLInputElement) =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim());

describe('AtsTextField', () => {
  it('is found by its label, and clicking the label activates the input', () => {
    mountTextField();
    const input = getByLabelText(LABEL);
    const label = document.querySelector('label')!;
    let clicked = 0;
    input.addEventListener('click', () => (clicked += 1));

    // happy-dom forwards a label click to its control but does not move focus as browsers do, so the
    // association is checked here and the focus move itself in the browser (QA).
    label.click();

    expect(label.control).toBe(input);
    expect(clicked).toBe(1);
  });

  it('defaults to a text input and passes the input attributes through', () => {
    mountTextField({
      placeholder: 'Nhập tên đầy đủ',
      autocomplete: 'name',
      maxlength: 120,
    });
    const input = getByLabelText(LABEL);

    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('Nhập tên đầy đủ');
    expect(input.getAttribute('autocomplete')).toBe('name');
    expect(input.maxLength).toBe(120);
  });

  it.each(['email', 'password', 'tel', 'url', 'number'] as const)('renders type %s', (type) => {
    mountTextField({ type });

    expect(getByLabelText(LABEL).getAttribute('type')).toBe(type);
  });

  it('forwards other attributes such as name to the input', () => {
    const wrapper = mount(AtsTextField, {
      props: { label: LABEL, modelValue: '' },
      attrs: { name: 'candidateName', 'data-testid': 'candidate-name' },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    const input = getByLabelText(LABEL);

    expect(input.name).toBe('candidateName');
    expect(input.dataset.testid).toBe('candidate-name');
  });

  it('describes the input with the helper text and is valid without an error', () => {
    mountTextField({ helper: HELPER });
    const input = getByLabelText(LABEL);

    expect(describedBy(input)).toEqual([HELPER]);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('with an error, is invalid, described by the error text, and hides the helper text', () => {
    const wrapper = mountTextField({ helper: HELPER, error: ERROR });
    const input = getByLabelText(LABEL);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(input)).toEqual([ERROR]);
    expect(wrapper.text()).not.toContain(HELPER);
  });

  it('with required, shows the marker and sets aria-required', () => {
    const wrapper = mountTextField({ required: true });
    const input = getByLabelText(LABEL);

    expect(wrapper.get('label').text()).toContain('*');
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('is not marked required by default', () => {
    mountTextField();

    expect(getByLabelText(LABEL).hasAttribute('aria-required')).toBe(false);
  });

  it('shows the v-model value and updates it on typing', async () => {
    const wrapper = mountTextField({ modelValue: 'Nguyễn Minh' });
    const input = getByLabelText(LABEL);

    expect(input.value).toBe('Nguyễn Minh');

    await wrapper.get('input').setValue('Nguyễn Minh Anh');

    expect(wrapper.emitted('update:modelValue')).toEqual([['Nguyễn Minh Anh']]);
  });

  it('follows a new v-model value from the parent', async () => {
    const wrapper = mountTextField({ modelValue: 'Nguyễn Minh' });

    await wrapper.setProps({ modelValue: 'Trần Thu Hà' });

    expect(getByLabelText(LABEL).value).toBe('Trần Thu Hà');
  });

  it('read-only ignores typing but lets the value be selected', async () => {
    const wrapper = mountTextField({ modelValue: 'Nguyễn Minh Anh', readonly: true });
    const input = getByLabelText(LABEL);

    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);

    await wrapper.get('input').setValue('Gõ thêm');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(input.value).toBe('Nguyễn Minh Anh');

    input.select();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Nguyễn Minh Anh'.length]);
  });

  it('disabled disables the input and dims the field', () => {
    const wrapper = mountTextField({ disabled: true });

    expect(getByLabelText(LABEL).disabled).toBe(true);
    expect(wrapper.classes()).toContain('ats-field--disabled');
  });

  it('flags the control box for the error, read-only and disabled styles', () => {
    expect(mountTextField({ error: ERROR }).get('.ats-text-field__box').classes()).toContain(
      'ats-text-field__box--error',
    );
    expect(mountTextField({ readonly: true }).get('.ats-text-field__box').classes()).toContain(
      'ats-text-field__box--readonly',
    );
    expect(mountTextField({ disabled: true }).get('.ats-text-field__box').classes()).toContain(
      'ats-text-field__box--disabled',
    );
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsTextField.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';

    it('draws a 36 px control and keeps it 36 px on mobile with a 44 px input inside', () => {
      expect(style).toMatch(/--ats-text-field-height:\s*36px/);
      const mobile = /@media[^{]*max-width[^{]*\{([\s\S]*?)\}\s*\}/.exec(style)?.[1] ?? '';
      expect(mobile).toMatch(/height:\s*var\(--touch-target-min\)/);
      expect(mobile).not.toMatch(/--ats-text-field-height/);
    });

    it('uses tokens only, never a raw colour', () => {
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });

    it('keeps the error surface and adds the focus ring on error focus', () => {
      expect(style).toMatch(/\.ats-text-field__box--error[^{]*\{[^}]*--color-error-surface/);
      expect(style).toMatch(/:focus-visible\)[^{]*\{[^}]*outline:[^;]*--color-focus-ring/);
    });
  });
});
