// Node types for this spec only: the sizing tests read the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import AtsTextarea from './AtsTextarea.vue';

const LABEL = 'Ghi chú';
const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra nội dung và thử lại.';

type Props = InstanceType<typeof AtsTextarea>['$props'];

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountTextarea(props: Partial<Props> = {}) {
  const wrapper = mount(AtsTextarea, {
    props: { label: LABEL, modelValue: '', ...props },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

/** The <label> whose text, minus aria-hidden parts, equals `text`, and the control it points at. */
function getByLabelText(text: string): HTMLTextAreaElement {
  const label = [...document.querySelectorAll('label')].find((candidate) => {
    const copy = candidate.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    return copy.textContent?.trim() === text;
  });
  if (!label) throw new Error(`No label with text "${text}"`);
  const control = document.getElementById(label.htmlFor);
  if (!(control instanceof HTMLTextAreaElement))
    throw new Error(`Label "${text}" labels no textarea`);
  return control;
}

const describedBy = (control: HTMLTextAreaElement) =>
  (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim());

describe('AtsTextarea', () => {
  it('is a textarea found by its label', () => {
    mountTextarea();

    expect(getByLabelText(LABEL).tagName).toBe('TEXTAREA');
  });

  it('passes placeholder, maxlength and rows through, with 3 rows by default', () => {
    mountTextarea({ placeholder: 'Nhập mô tả chi tiết', maxlength: 2000 });
    const control = getByLabelText(LABEL);

    expect(control.placeholder).toBe('Nhập mô tả chi tiết');
    expect(control.maxLength).toBe(2000);
    expect(control.getAttribute('rows')).toBe('3');
  });

  it('accepts a custom rows count', () => {
    mountTextarea({ rows: 6 });

    expect(getByLabelText(LABEL).getAttribute('rows')).toBe('6');
  });

  it('forwards other attributes such as name to the textarea', () => {
    const wrapper = mount(AtsTextarea, {
      props: { label: LABEL, modelValue: '' },
      attrs: { name: 'note', 'data-testid': 'candidate-note', class: 'outer' },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    const control = getByLabelText(LABEL);

    expect(control.name).toBe('note');
    expect(control.dataset.testid).toBe('candidate-note');
    expect(wrapper.classes()).toContain('outer');
    expect(control.classList.contains('outer')).toBe(false);
  });

  it('shows the v-model value and updates it on typing', async () => {
    const wrapper = mountTextarea({ modelValue: 'Nguyễn Minh' });
    const control = getByLabelText(LABEL);

    expect(control.value).toBe('Nguyễn Minh');

    await wrapper.get('textarea').setValue('Nguyễn Minh Anh\nỨng viên tiềm năng');

    expect(wrapper.emitted('update:modelValue')).toEqual([['Nguyễn Minh Anh\nỨng viên tiềm năng']]);
  });

  it('follows a new v-model value from the parent', async () => {
    const wrapper = mountTextarea({ modelValue: 'Nguyễn Minh' });

    await wrapper.setProps({ modelValue: 'Trần Thu Hà' });

    expect(getByLabelText(LABEL).value).toBe('Trần Thu Hà');
  });

  it('Enter inserts a new line and does not submit a surrounding form', async () => {
    let submits = 0;
    const note = ref('Dòng một');
    const Host = defineComponent({
      setup: () => () =>
        h(
          'form',
          {
            onSubmit: (event: Event) => {
              event.preventDefault();
              submits += 1;
            },
          },
          [
            h(AtsTextarea, {
              label: LABEL,
              modelValue: note.value,
              'onUpdate:modelValue': (value: string) => (note.value = value),
            }),
            h('button', { type: 'submit' }, 'Lưu'),
          ],
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    mounted.push(wrapper);
    const control = getByLabelText(LABEL);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    control.dispatchEvent(enter);
    // The browser inserts the line break as the default action of an uncancelled Enter.
    expect(enter.defaultPrevented).toBe(false);
    await wrapper.get('textarea').setValue('Dòng một\nDòng hai');

    expect(note.value).toBe('Dòng một\nDòng hai');
    expect(submits).toBe(0);
  });

  it('describes the textarea with the helper text and is valid without an error', () => {
    mountTextarea({ helper: HELPER });
    const control = getByLabelText(LABEL);

    expect(describedBy(control)).toEqual([HELPER]);
    expect(control.hasAttribute('aria-invalid')).toBe(false);
  });

  it('with an error, is invalid, described by the error text, and hides the helper text', () => {
    const wrapper = mountTextarea({ helper: HELPER, error: ERROR });
    const control = getByLabelText(LABEL);

    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(control)).toEqual([ERROR]);
    expect(wrapper.text()).not.toContain(HELPER);
    expect(wrapper.findAll('.ats-field__message')).toHaveLength(1);
  });

  it('with required, shows the marker and sets aria-required', () => {
    const wrapper = mountTextarea({ required: true });
    const control = getByLabelText(LABEL);

    expect(wrapper.get('label').text()).toContain('*');
    expect(control.getAttribute('aria-required')).toBe('true');
  });

  it('read-only ignores typing', async () => {
    const wrapper = mountTextarea({ modelValue: 'Nguyễn Minh Anh', readonly: true });
    const control = getByLabelText(LABEL);

    expect(control.readOnly).toBe(true);
    expect(control.disabled).toBe(false);

    await wrapper.get('textarea').setValue('Gõ thêm');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(control.value).toBe('Nguyễn Minh Anh');
  });

  it('disabled disables the textarea and dims the field', () => {
    const wrapper = mountTextarea({ disabled: true });

    expect(getByLabelText(LABEL).disabled).toBe(true);
    expect(wrapper.classes()).toContain('ats-field--disabled');
  });

  it('flags the control for the error, read-only and disabled styles', () => {
    expect(mountTextarea({ error: ERROR }).get('textarea').classes()).toContain(
      'ats-textarea__control--error',
    );
    expect(mountTextarea({ readonly: true }).get('textarea').classes()).toContain(
      'ats-textarea__control--readonly',
    );
    expect(mountTextarea({ disabled: true }).get('textarea').classes()).toContain(
      'ats-textarea__control--disabled',
    );
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsTextarea.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const rule = (selector: string) =>
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
        style,
      )?.[1] ?? '';

    it('draws a control at least 96 px high with a 12 px inset', () => {
      expect(style).toMatch(/--ats-textarea-min-height:\s*96px/);
      expect(style).toMatch(/--ats-textarea-inset:\s*var\(--space-3\)/);
      expect(rule('.ats-textarea__control')).toMatch(
        /min-height:\s*var\(--ats-textarea-min-height\)/,
      );
    });

    it('resizes vertically only and wraps long text instead of scrolling sideways', () => {
      const control = rule('.ats-textarea__control');
      expect(control).toMatch(/resize:\s*vertical/);
      expect(control).toMatch(/overflow-x:\s*hidden/);
      expect(control).toMatch(/overflow-wrap:\s*anywhere/);
      expect(control).toMatch(/white-space:\s*pre-wrap/);
    });

    it('spaces label, control and message 8 px apart', () => {
      expect(style).toMatch(/--ats-field-label-gap:\s*var\(--space-2\)/);
    });

    it('uses tokens only, never a raw colour', () => {
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });

    it('keeps the error surface and adds the focus ring on error focus', () => {
      expect(style).toMatch(/\.ats-textarea__control--error[^{]*\{[^}]*--color-error-surface/);
      expect(style).toMatch(/:focus-visible[^{]*\{[^}]*outline:[^;]*--color-focus-ring/);
    });
  });
});
