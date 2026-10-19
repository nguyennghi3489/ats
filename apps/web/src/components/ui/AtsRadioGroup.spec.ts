// Node types for this spec only: the sizing tests read the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import AtsRadio from './AtsRadio.vue';
import AtsRadioGroup from './AtsRadioGroup.vue';
import AtsRadioGroupDemo from './AtsRadioGroup.demo.vue';

const LEGEND = 'Phạm vi làm việc từ xa';
const ERROR = 'Chọn một phạm vi áp dụng trước khi tiếp tục.';
const OPTIONS = [
  { value: 'global', label: 'Toàn cầu' },
  { value: 'countries', label: 'Các quốc gia được chọn' },
  { value: 'regions', label: 'Chỉ các khu vực được chỉ định', disabled: true },
  { value: 'office', label: 'Chỉ làm việc tại văn phòng' },
];

const source = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/ui', file), 'utf8');

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountGroup(
  groupProps: Record<string, unknown> = {},
  initial: string | undefined = undefined,
) {
  const model = ref<string | undefined>(initial);
  const Host = defineComponent({
    setup: () => () =>
      h(
        AtsRadioGroup,
        {
          name: 'remote',
          legend: LEGEND,
          ...groupProps,
          modelValue: model.value,
          'onUpdate:modelValue': (value: string | undefined) => (model.value = value),
        },
        () => OPTIONS.map((option) => h(AtsRadio, { key: option.value, ...option })),
      ),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  mounted.push(wrapper);
  return { wrapper, model };
}

function getRadio(label: string): HTMLInputElement {
  const labelElement = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!labelElement) throw new Error(`No label with text "${label}"`);
  const input =
    labelElement.querySelector('input') ?? document.getElementById(labelElement.htmlFor);
  if (!(input instanceof HTMLInputElement) || input.type !== 'radio')
    throw new Error(`Label "${label}" labels no radio`);
  return input;
}

function press(input: HTMLInputElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

const describedBy = (input: HTMLInputElement) =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim());

describe('AtsRadioGroup', () => {
  it('renders native radios sharing the group name, each found by its label', () => {
    mountGroup();

    for (const option of OPTIONS) {
      const input = getRadio(option.label);
      expect(input.name).toBe('remote');
      expect(input.value).toBe(option.value);
    }
  });

  it('checks the radio matching v-model', () => {
    mountGroup({}, 'countries');

    expect(getRadio('Các quốc gia được chọn').checked).toBe(true);
    expect(getRadio('Toàn cầu').checked).toBe(false);
  });

  it('updates v-model when a label is clicked', async () => {
    const { model } = mountGroup();

    getRadio('Toàn cầu').closest('label')!.click();
    await nextTick();

    expect(model.value).toBe('global');
    expect(getRadio('Toàn cầu').checked).toBe(true);
  });

  it('moves the selection with the arrow keys, skipping disabled options and wrapping', async () => {
    const { model } = mountGroup({}, 'global');

    const down = press(getRadio('Toàn cầu'), 'ArrowDown');
    await nextTick();
    expect(down.defaultPrevented).toBe(true);
    expect(model.value).toBe('countries');
    expect(document.activeElement).toBe(getRadio('Các quốc gia được chọn'));

    press(getRadio('Các quốc gia được chọn'), 'ArrowRight');
    await nextTick();
    expect(model.value).toBe('office');

    press(getRadio('Chỉ làm việc tại văn phòng'), 'ArrowDown');
    await nextTick();
    expect(model.value).toBe('global');

    press(getRadio('Toàn cầu'), 'ArrowUp');
    await nextTick();
    expect(model.value).toBe('office');

    press(getRadio('Chỉ làm việc tại văn phòng'), 'ArrowLeft');
    await nextTick();
    expect(model.value).toBe('countries');
  });

  it('does not select a disabled option', async () => {
    const { model } = mountGroup({}, 'global');
    const disabled = getRadio('Chỉ các khu vực được chỉ định');

    expect(disabled.disabled).toBe(true);
    disabled.closest('label')!.click();
    await nextTick();

    expect(model.value).toBe('global');
  });

  it('disables every option when the group is disabled', async () => {
    const { model } = mountGroup({ disabled: true }, 'global');

    for (const option of OPTIONS) expect(getRadio(option.label).disabled).toBe(true);
    getRadio('Các quốc gia được chọn').closest('label')!.click();
    press(getRadio('Toàn cầu'), 'ArrowDown');
    await nextTick();

    expect(model.value).toBe('global');
  });

  it('is a group named by its legend', () => {
    mountGroup();
    const fieldset = document.querySelector('fieldset');

    expect(fieldset).not.toBeNull();
    expect(fieldset!.querySelector(':scope > legend')?.textContent?.trim()).toBe(LEGEND);
  });

  it('can hide the legend visually while keeping it as the group name', () => {
    mountGroup({ hideLegend: true });
    const legend = document.querySelector('fieldset > legend')!;

    expect(legend.textContent?.trim()).toBe(LEGEND);
    expect(legend.classList).toContain('ats-radio-group__legend--hidden');
  });

  it('is valid and undescribed without an error', () => {
    mountGroup();

    for (const option of OPTIONS) {
      const input = getRadio(option.label);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    }
  });

  it('marks every input invalid and describes it with the error text', () => {
    mountGroup({ error: ERROR });

    for (const option of OPTIONS) {
      const input = getRadio(option.label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(describedBy(input)).toEqual([ERROR]);
    }
    const message = document.querySelector('.ats-radio-group__error')!;
    expect(message.textContent?.trim()).toBe(ERROR);
    // The message sits below the options.
    const lastOption = getRadio('Chỉ làm việc tại văn phòng');
    expect(
      lastOption.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('gives each group its own error id', () => {
    const group = (name: string) =>
      h(AtsRadioGroup, { name, legend: LEGEND, error: ERROR }, () =>
        h(AtsRadio, { value: 'global', label: `Toàn cầu ${name}` }),
      );
    const wrapper = mount(
      defineComponent({ setup: () => () => h('div', [group('one'), group('two')]) }),
      { attachTo: document.body },
    );
    mounted.push(wrapper);
    expect(describedBy(getRadio('Toàn cầu one'))).toEqual([ERROR]);
    expect(getRadio('Toàn cầu one').getAttribute('aria-describedby')).not.toBe(
      getRadio('Toàn cầu two').getAttribute('aria-describedby'),
    );
    const ids = [...document.querySelectorAll('.ats-radio-group__error')].map((node) => node.id);

    expect(new Set(ids).size).toBe(2);
  });

  it('keeps each option at least 44 px high below the mobile breakpoint and wraps long labels', () => {
    const css = source('AtsRadio.vue');
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));

    expect(css).toContain('@media (max-width: 767px)');
    expect(mobile).toMatch(/min-height:\s*var\(--touch-target-min\)/);
    expect(css).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });

  it('keeps each gallery panel independent when the demo is mounted several times in one document', async () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h('div', [h(AtsRadioGroupDemo), h(AtsRadioGroupDemo), h(AtsRadioGroupDemo)]),
      }),
      { attachTo: document.body },
    );
    mounted.push(wrapper);
    const panelRadios = (state: string, value: string) => [
      ...document.querySelectorAll<HTMLInputElement>(
        `[data-state="${state}"] input[type="radio"][value="${value}"]`,
      ),
    ];

    for (const state of ['unselected', 'selected', 'focus', 'disabled', 'error', 'group', 'long']) {
      const names = [
        ...document.querySelectorAll<HTMLInputElement>(
          `[data-state="${state}"] input[type="radio"]`,
        ),
      ].map((radio) => radio.name);
      expect(new Set(names).size).toBe(3);
    }

    const [, , last] = panelRadios('group', 'global');
    last?.click();
    await nextTick();

    expect(panelRadios('group', 'countries').map((radio) => radio.checked)).toEqual([
      true,
      true,
      false,
    ]);
    expect(panelRadios('selected', 'global').map((radio) => radio.checked)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('uses tokens only, no raw hex colours', () => {
    for (const file of ['AtsRadio.vue', 'AtsRadioGroup.vue', 'AtsRadioGroup.demo.vue']) {
      expect(source(file)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });
});
