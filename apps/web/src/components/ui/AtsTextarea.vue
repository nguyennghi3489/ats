<!--
  Multi-line text field (design page "01 · Foundations", ATS / Textarea), built on AtsField.
  The control is at least 96 px high with a 12 px inset (3 rows by default), wraps long text instead of
  scrolling sideways, and can be resized vertically only. Enter inserts a new line; a textarea never
  submits its form. Attributes other than class and style (name, data-testid, ...) go to the <textarea>.
-->
<script setup lang="ts">
import { computed, useAttrs, useTemplateRef } from 'vue';
import AtsField from './AtsField.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    label: string;
    placeholder?: string;
    helper?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    maxlength?: number;
    /** Visible lines. The default of 3 fills the 96 px minimum height. */
    rows?: number;
    id?: string;
  }>(),
  {
    placeholder: undefined,
    helper: undefined,
    error: undefined,
    required: false,
    disabled: false,
    readonly: false,
    maxlength: undefined,
    rows: 3,
    id: undefined,
  },
);

const model = defineModel<string>({ default: '' });

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const controlAttrs = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
);

const control = useTemplateRef('control');

function onInput() {
  if (!control.value) return;
  if (props.readonly || props.disabled) {
    // Keep the shown value in step with the model when something writes to a read-only textarea.
    control.value.value = model.value;
    return;
  }
  model.value = control.value.value;
}
</script>

<template>
  <AtsField
    v-bind="rootAttrs"
    :id="id"
    v-slot="{ controlId, describedBy, invalid }"
    class="ats-textarea"
    :label="label"
    :required="required"
    :helper="helper"
    :error="error"
    :disabled="disabled"
  >
    <textarea
      v-bind="controlAttrs"
      :id="controlId"
      ref="control"
      class="ats-textarea__control"
      :class="{
        'ats-textarea__control--error': invalid,
        'ats-textarea__control--readonly': readonly,
        'ats-textarea__control--disabled': disabled,
      }"
      :value="model"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      :aria-describedby="describedBy"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-required="required ? 'true' : undefined"
      @input="onInput"
    />
  </AtsField>
</template>

<style scoped>
/* Label, control and message sit 8 px apart ("QA · Textarea states"); the base field uses 6 px. */
.ats-textarea.ats-field {
  --ats-field-label-gap: var(--space-2);
}

.ats-textarea__control {
  /* Control geometry from "QA · Textarea states": at least 96 px high, 12 px inset. */
  --ats-textarea-min-height: 96px;
  --ats-textarea-inset: var(--space-3);
  --ats-textarea-border: 1px;

  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: var(--ats-textarea-min-height);
  margin: 0;
  padding: calc(var(--ats-textarea-inset) - var(--ats-textarea-border));
  border: var(--ats-textarea-border) solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-field-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  overflow-x: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  resize: vertical;
}

.ats-textarea__control:hover:not(
    .ats-textarea__control--readonly,
    .ats-textarea__control--disabled
  ) {
  border-color: var(--color-action-line);
}

.ats-textarea__control--error,
.ats-textarea__control--error:hover:not(
    .ats-textarea__control--readonly,
    .ats-textarea__control--disabled
  ) {
  border-color: var(--color-danger);
  background: var(--color-error-surface);
}

/* Read-only shows the value on the field surface without the editable border. */
.ats-textarea__control--readonly:not(.ats-textarea__control--error) {
  border-color: transparent;
}

/* The ring sits outside the border, so an error field keeps its error border and surface. */
.ats-textarea__control:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-textarea__control::placeholder {
  color: var(--color-muted);
  opacity: 1;
}

.ats-textarea__control--disabled {
  cursor: not-allowed;
  resize: none;
}
</style>
