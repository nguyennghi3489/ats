<!--
  Single-line text field (design page "01 · Foundations", ATS / Text field), built on AtsField.
  The visible control is 36 px high. Below the mobile breakpoint the <input> grows to a 44 px tap target
  centred on that 36 px surface, so the surface looks the same while the hit area meets the minimum.
  Long values scroll horizontally inside the input and never wrap.
  Attributes other than class and style (name, inputmode, data-testid, ...) go to the <input>.
-->
<script setup lang="ts">
import { computed, useAttrs, useTemplateRef } from 'vue';
import AtsField from './AtsField.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number';
    placeholder?: string;
    helper?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    autocomplete?: string;
    maxlength?: number;
    id?: string;
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    helper: undefined,
    error: undefined,
    required: false,
    disabled: false,
    readonly: false,
    autocomplete: undefined,
    maxlength: undefined,
    id: undefined,
  },
);

const model = defineModel<string>({ default: '' });

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const inputAttrs = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
);

const input = useTemplateRef('input');

function onInput() {
  if (!input.value) return;
  if (props.readonly || props.disabled) {
    // Keep the shown value in step with the model when something writes to a read-only input.
    input.value.value = model.value;
    return;
  }
  model.value = input.value.value;
}
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
      class="ats-text-field__box"
      :class="{
        'ats-text-field__box--error': invalid,
        'ats-text-field__box--readonly': readonly,
        'ats-text-field__box--disabled': disabled,
      }"
    >
      <input
        v-bind="inputAttrs"
        :id="controlId"
        ref="input"
        class="ats-text-field__input"
        :type="type"
        :value="model"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-required="required ? 'true' : undefined"
        @input="onInput"
      />
    </div>
  </AtsField>
</template>

<style scoped>
.ats-text-field__box {
  /* Control geometry from "QA · Text field states": 36 px surface, 10 px inner gutter. */
  --ats-text-field-height: 36px;
  --ats-text-field-gutter: 10px;
  --ats-text-field-border: 1px;

  position: relative;
  box-sizing: border-box;
  height: var(--ats-text-field-height);
  min-width: 0;
  border: var(--ats-text-field-border) solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-field-surface);
  color: var(--color-ink);
}

.ats-text-field__box:hover:not(.ats-text-field__box--readonly, .ats-text-field__box--disabled) {
  border-color: var(--color-action-line);
}

.ats-text-field__box--error,
.ats-text-field__box--error:hover:not(
    .ats-text-field__box--readonly,
    .ats-text-field__box--disabled
  ) {
  border-color: var(--color-danger);
  background: var(--color-error-surface);
}

/* The ring sits outside the border, so an error field keeps its error border and surface. */
.ats-text-field__box:has(.ats-text-field__input:focus-visible) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-text-field__input {
  position: absolute;
  top: 50%;
  left: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0 calc(var(--ats-text-field-gutter) - var(--ats-text-field-border));
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  text-overflow: clip;
  white-space: nowrap;
  transform: translateY(-50%);
}

.ats-text-field__input:focus-visible {
  outline: none;
}

.ats-text-field__input::placeholder {
  color: var(--color-muted);
  opacity: 1;
}

.ats-text-field__box--disabled .ats-text-field__input {
  cursor: not-allowed;
}

/* Mobile: a 44 px tap target around the unchanged 36 px surface. */
@media (max-width: 767px) {
  .ats-text-field__input {
    height: var(--touch-target-min);
  }
}
</style>
