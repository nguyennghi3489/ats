<!--
  Single-choice select (design page "01 · Foundations", ATS / Select field), built on AtsField.
  A native <select> covers the whole control, so the OS picker and keyboard behaviour come for free;
  it is drawn invisible over a styled surface that shows the selected label and the chevron. The drawn
  label is aria-hidden: assistive technology reads the select itself.
  Desktop: a 36 px surface, long labels end with an ellipsis. Below the mobile breakpoint the select is
  a 44 px tap target, and a long label wraps to two lines on a min 60 px surface instead of being cut.
  Option labels come from the caller, already translated (decisions §12). `valueLabel`, when given,
  is drawn on the closed control instead of the selected option's label (e.g. "Trạng thái: Tất cả")
  while the options keep their own labels.
  Attributes other than class and style (name, data-testid, ...) go to the <select>.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, useTemplateRef, watch } from 'vue';
import AtsField from './AtsField.vue';
import AtsIcon from './AtsIcon.vue';

export interface AtsSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    options: AtsSelectOption[];
    /** Shown while the value is null, as an empty first option that cannot be chosen. */
    placeholder?: string;
    /** Drawn on the closed control instead of the selected option's label. */
    valueLabel?: string;
    helper?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
  }>(),
  {
    placeholder: undefined,
    valueLabel: undefined,
    helper: undefined,
    error: undefined,
    required: false,
    disabled: false,
    id: undefined,
  },
);

const model = defineModel<string | null>({ default: null });

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const selectAttrs = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
);

const selected = computed(() => props.options.find((option) => option.value === model.value));
const showsPlaceholder = computed(() => !selected.value && props.placeholder !== undefined);
const shownLabel = computed(() =>
  selected.value
    ? (props.valueLabel ?? selected.value.label)
    : showsPlaceholder.value
      ? props.placeholder
      : '',
);

const select = useTemplateRef('select');

/** Puts the DOM selection in step with the model; an unknown or null value selects nothing. */
function syncSelection() {
  if (!select.value) return;
  select.value.value = selected.value ? selected.value.value : '';
  if (!selected.value && props.placeholder === undefined) select.value.selectedIndex = -1;
}

watch([model, () => props.options, () => props.placeholder], syncSelection, { flush: 'post' });

function onChange() {
  if (!select.value) return;
  model.value = select.value.value === '' ? null : select.value.value;
  // If the parent keeps the old value, show that one again.
  syncSelection();
}

// The two-line mobile surface applies only when the label really wraps.
const valueEl = useTemplateRef('value');
const multiline = ref(false);
let observer: { disconnect(): void } | undefined;

function measure() {
  const el = valueEl.value;
  const view = el?.ownerDocument.defaultView;
  if (!el || !view) return;
  const lineHeight = parseFloat(view.getComputedStyle(el).lineHeight);
  multiline.value = Number.isFinite(lineHeight) && el.clientHeight > lineHeight * 1.5;
}

onMounted(() => {
  syncSelection();
  const el = valueEl.value;
  const view = el?.ownerDocument.defaultView;
  if (!el || !view || typeof view.ResizeObserver !== 'function') return;
  const resizeObserver = new view.ResizeObserver(measure);
  resizeObserver.observe(el);
  observer = resizeObserver;
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <AtsField
    v-bind="rootAttrs"
    :id="id"
    v-slot="{ controlId, describedBy, invalid }"
    :label="label"
    :required="required"
    :helper="helper"
    :error="error"
    :disabled="disabled"
  >
    <div
      class="ats-select__box"
      :class="{
        'ats-select__box--error': invalid,
        'ats-select__box--disabled': disabled,
        'ats-select__box--multiline': multiline,
      }"
    >
      <span
        ref="value"
        class="ats-select__value"
        :class="{ 'ats-select__value--placeholder': showsPlaceholder }"
        aria-hidden="true"
        >{{ shownLabel }}</span
      >
      <span class="ats-select__chevron" aria-hidden="true">
        <AtsIcon name="chevron-down" :size="14" />
      </span>
      <select
        v-bind="selectAttrs"
        :id="controlId"
        ref="select"
        class="ats-select__control"
        :disabled="disabled"
        :required="required"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-required="required ? 'true' : undefined"
        @change="onChange"
      >
        <option v-if="placeholder !== undefined" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
    </div>
  </AtsField>
</template>

<style scoped>
.ats-select__box {
  /* Control geometry from "QA · Select field states": 36 px surface, 10 px inner gutter. */
  --ats-select-height: 36px;
  --ats-select-gutter: 10px;
  --ats-select-border: 1px;
  --ats-select-chevron: 14px;

  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  min-height: var(--ats-select-height);
  /* Left: the 10 px gutter. Right: room for the chevron and a gutter on each side of it. */
  padding: 0
    calc(var(--ats-select-gutter) * 2 + var(--ats-select-chevron) - var(--ats-select-border)) 0
    calc(var(--ats-select-gutter) - var(--ats-select-border));
  border: var(--ats-select-border) solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-field-surface);
  color: var(--color-ink);
}

.ats-select__box:hover:not(.ats-select__box--disabled) {
  border-color: var(--color-action-line);
}

.ats-select__box--error,
.ats-select__box--error:hover:not(.ats-select__box--disabled) {
  border-color: var(--color-danger);
  background: var(--color-error-surface);
}

/* The ring sits outside the border, so an error field keeps its error border and surface. */
.ats-select__box:has(.ats-select__control:focus-visible) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-select__value {
  /* No intrinsic width, so a long label never widens the field beyond its container. */
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ats-select__value--placeholder {
  color: var(--color-muted);
}

.ats-select__chevron {
  position: absolute;
  top: 50%;
  right: var(--ats-select-gutter);
  display: flex;
  color: var(--color-muted);
  pointer-events: none;
  transform: translateY(-50%);
}

/* The native select: invisible, over the whole surface, so any click on the control opens the picker. */
.ats-select__control {
  position: absolute;
  top: 50%;
  left: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  appearance: none;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transform: translateY(-50%);
}

.ats-select__control option {
  color: var(--color-ink);
  background: var(--color-field-surface);
}

.ats-select__box--disabled .ats-select__control {
  cursor: not-allowed;
}

/* Mobile: a 44 px tap target; a long label wraps to two lines on a min 60 px surface. */
@media (max-width: 767px) {
  .ats-select__control {
    height: max(100%, var(--touch-target-min));
  }

  .ats-select__value {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .ats-select__box--multiline {
    min-height: 60px;
    padding-top: calc(var(--space-2) - var(--ats-select-border));
    padding-bottom: calc(var(--space-2) - var(--ats-select-border));
  }
}
</style>
