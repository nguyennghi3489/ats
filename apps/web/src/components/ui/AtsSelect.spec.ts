// Node types for this spec only: the sizing tests read the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import AtsSelect from './AtsSelect.vue';

const LABEL = 'Loại hình việc làm';
const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Chọn một giá trị hợp lệ';
const PLACEHOLDER = 'Chọn loại hình';
const OPTIONS = [
  { value: 'full_time', label: 'Toàn thời gian' },
  { value: 'part_time', label: 'Bán thời gian' },
  { value: 'contract', label: 'Hợp đồng', disabled: true },
];

type Props = InstanceType<typeof AtsSelect>['$props'];

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountSelect(props: Partial<Props> = {}, attrs: Record<string, unknown> = {}) {
  const wrapper = mount(AtsSelect, {
    props: { label: LABEL, options: OPTIONS, modelValue: null, ...props },
    attrs,
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

/**
 * Testing Library's getByLabelText, reduced to what these specs need: the <label> whose text, minus
 * decorative (aria-hidden) parts, equals `text`, and the control its `for` points at.
 */
function getByLabelText(text: string): HTMLSelectElement {
  const label = [...document.querySelectorAll('label')].find((candidate) => {
    const copy = candidate.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return copy.textContent?.trim() === text;
  });
  if (!label) throw new Error(`No label with text "${text}"`);
  const control = document.getElementById(label.htmlFor);
  if (!(control instanceof HTMLSelectElement)) throw new Error(`Label "${text}" labels no select`);
  return control;
}

const describedBy = (select: HTMLSelectElement) =>
  (select.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim());

/** The text a sighted user reads in the closed control. */
const shownValue = (wrapper: ReturnType<typeof mountSelect>) =>
  wrapper.get('.ats-select__value').text();

describe('AtsSelect', () => {
  it('is found by its label as a native select with the given options', () => {
    mountSelect({ modelValue: 'full_time' });
    const select = getByLabelText(LABEL);

    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => [option.value, option.text])).toEqual([
      ['full_time', 'Toàn thời gian'],
      ['part_time', 'Bán thời gian'],
      ['contract', 'Hợp đồng'],
    ]);
    expect(select.options[2]!.disabled).toBe(true);
  });

  it('shows the v-model value as the selected option', () => {
    const wrapper = mountSelect({ modelValue: 'part_time' });

    expect(getByLabelText(LABEL).value).toBe('part_time');
    expect(shownValue(wrapper)).toBe('Bán thời gian');
  });

  it('choosing an option updates the v-model value', async () => {
    const wrapper = mountSelect({ modelValue: 'full_time' });

    await wrapper.get('select').setValue('part_time');

    expect(wrapper.emitted('update:modelValue')).toEqual([['part_time']]);
  });

  it('follows a new v-model value from the parent', async () => {
    const wrapper = mountSelect({ modelValue: 'full_time' });

    await wrapper.setProps({ modelValue: 'part_time' });

    expect(getByLabelText(LABEL).value).toBe('part_time');
    expect(shownValue(wrapper)).toBe('Bán thời gian');
  });

  it('with a placeholder and a null value, shows the placeholder as an empty, disabled first option', () => {
    const wrapper = mountSelect({ placeholder: PLACEHOLDER, modelValue: null });
    const select = getByLabelText(LABEL);
    const first = select.options[0]!;

    expect(first.value).toBe('');
    expect(first.text).toBe(PLACEHOLDER);
    expect(first.disabled).toBe(true);
    expect(select.selectedIndex).toBe(0);
    expect(shownValue(wrapper)).toBe(PLACEHOLDER);
    expect(wrapper.get('.ats-select__value').classes()).toContain('ats-select__value--placeholder');
  });

  it('cannot re-select the placeholder once a value is chosen', async () => {
    const wrapper = mountSelect({ placeholder: PLACEHOLDER, modelValue: null });
    await wrapper.get('select').setValue('full_time');
    await wrapper.setProps({ modelValue: 'full_time' });

    // The placeholder option is disabled, so the picker and the keyboard skip it.
    expect(getByLabelText(LABEL).options[0]!.disabled).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([['full_time']]);
    expect(shownValue(wrapper)).toBe('Toàn thời gian');
    expect(wrapper.get('.ats-select__value').classes()).not.toContain(
      'ats-select__value--placeholder',
    );
  });

  it('goes back to the placeholder when the parent resets the value to null', async () => {
    const wrapper = mountSelect({ placeholder: PLACEHOLDER, modelValue: 'full_time' });

    await wrapper.setProps({ modelValue: null });

    expect(getByLabelText(LABEL).selectedIndex).toBe(0);
    expect(shownValue(wrapper)).toBe(PLACEHOLDER);
  });

  it('without a placeholder and a null value, selects nothing', () => {
    const wrapper = mountSelect({ modelValue: null });

    expect(getByLabelText(LABEL).selectedIndex).toBe(-1);
    expect(shownValue(wrapper)).toBe('');
  });

  it('describes the select with the helper text and is valid without an error', () => {
    mountSelect({ helper: HELPER });
    const select = getByLabelText(LABEL);

    expect(describedBy(select)).toEqual([HELPER]);
    expect(select.hasAttribute('aria-invalid')).toBe(false);
  });

  it('with an error, is invalid, described by the error text, and hides the helper text', () => {
    const wrapper = mountSelect({ helper: HELPER, error: ERROR });
    const select = getByLabelText(LABEL);

    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(select)).toEqual([ERROR]);
    expect(wrapper.text()).not.toContain(HELPER);
    expect(wrapper.get('.ats-select__box').classes()).toContain('ats-select__box--error');
  });

  it('with required, shows the marker and marks the select required', () => {
    const wrapper = mountSelect({ required: true });
    const select = getByLabelText(LABEL);

    expect(wrapper.get('label').text()).toContain('*');
    expect(select.required).toBe(true);
    expect(select.getAttribute('aria-required')).toBe('true');
  });

  it('disabled disables the select and dims the field', () => {
    const wrapper = mountSelect({ disabled: true });

    expect(getByLabelText(LABEL).disabled).toBe(true);
    expect(wrapper.classes()).toContain('ats-field--disabled');
    expect(wrapper.get('.ats-select__box').classes()).toContain('ats-select__box--disabled');
  });

  it('draws a decorative chevron', () => {
    const wrapper = mountSelect();
    const chevron = wrapper.get('.ats-select__chevron');

    expect(chevron.attributes('aria-hidden')).toBe('true');
    expect(chevron.find('svg').exists()).toBe(true);
  });

  it('hides the drawn value from assistive technology, which reads the select itself', () => {
    const wrapper = mountSelect({ modelValue: 'full_time' });

    expect(wrapper.get('.ats-select__value').attributes('aria-hidden')).toBe('true');
  });

  it('forwards other attributes such as name to the select and class to the root', () => {
    const wrapper = mountSelect(
      {},
      { name: 'employmentType', 'data-testid': 'employment-type', class: 'job-form__field' },
    );
    const select = getByLabelText(LABEL);

    expect(select.name).toBe('employmentType');
    expect(select.dataset.testid).toBe('employment-type');
    expect(wrapper.classes()).toContain('job-form__field');
    expect(select.classList.contains('job-form__field')).toBe(false);
  });

  it('uses the given id for the select', () => {
    mountSelect({ id: 'employment-type' });

    expect(getByLabelText(LABEL).id).toBe('employment-type');
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsSelect.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const mobile = /@media[^{]*max-width[^{]*\{([\s\S]*)\}\s*$/.exec(style.trim())?.[1] ?? '';

    it('draws a 36 px control from a native select without its own appearance', () => {
      expect(style).toMatch(/--ats-select-height:\s*36px/);
      expect(style).toMatch(/appearance:\s*none/);
    });

    it('lets clicks through the chevron to the select', () => {
      expect(style).toMatch(/\.ats-select__chevron\s*\{[^}]*pointer-events:\s*none/);
    });

    it('on mobile, gives a 44 px target and wraps a long value to two lines on a 60 px surface', () => {
      expect(mobile).toMatch(/var\(--touch-target-min\)/);
      expect(mobile).toMatch(/-webkit-line-clamp:\s*2/);
      expect(mobile).toMatch(/\.ats-select__box--multiline\s*\{[^}]*min-height:\s*60px/);
    });

    it('uses tokens only, never a raw colour', () => {
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });

    it('keeps the error surface and adds the focus ring on error focus', () => {
      expect(style).toMatch(/\.ats-select__box--error[^{]*\{[^}]*--color-error-surface/);
      expect(style).toMatch(/:focus-visible\)[^{]*\{[^}]*outline:[^;]*--color-focus-ring/);
    });
  });
});
