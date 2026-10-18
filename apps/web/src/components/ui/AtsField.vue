<!--
  Shared field wrapper (design page "01 · Foundations", ATS / Field): the label with its required
  marker, the control in the default slot, then the error text or, without an error, the helper text.
  The slot receives `controlId` and `describedBy` (plus `invalid`, `required`, `disabled`) so the control
  sets `id`, `aria-describedby`, `aria-invalid` and `aria-required`. AtsTextField, AtsSelect and
  AtsTextarea build on it. All text comes from the caller, already translated.
-->
<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    required?: boolean;
    /** Hint under the control. Hidden while there is an error. */
    helper?: string;
    /** Error message (already translated). Marks the control invalid. */
    error?: string;
    disabled?: boolean;
    /** Id of the control. Generated when omitted. */
    id?: string;
  }>(),
  {
    required: false,
    helper: undefined,
    error: undefined,
    disabled: false,
    id: undefined,
  },
);

defineSlots<{
  default(props: {
    controlId: string;
    describedBy: string | undefined;
    invalid: boolean;
    required: boolean;
    disabled: boolean;
  }): unknown;
}>();

const generatedId = useId();
const controlId = computed(() => props.id ?? generatedId);
const invalid = computed(() => Boolean(props.error));
const messageId = computed(() => `${controlId.value}-${invalid.value ? 'error' : 'helper'}`);
const message = computed(() => (invalid.value ? props.error : props.helper));
const describedBy = computed(() => (message.value ? messageId.value : undefined));
</script>

<template>
  <div class="ats-field" :class="{ 'ats-field--error': invalid, 'ats-field--disabled': disabled }">
    <label class="ats-field__label" :for="controlId">
      {{ label }}<span v-if="required" class="ats-field__required" aria-hidden="true">*</span>
    </label>
    <slot
      :control-id="controlId"
      :described-by="describedBy"
      :invalid="invalid"
      :required="required"
      :disabled="disabled"
    />
    <p
      v-if="message"
      :id="messageId"
      class="ats-field__message"
      :class="invalid ? 'ats-field__message--error' : 'ats-field__message--helper'"
    >
      {{ message }}
    </p>
  </div>
</template>

<style scoped>
.ats-field {
  /* Label to control gap from "QA · Text field states". */
  --ats-field-label-gap: 6px;

  display: flex;
  flex-direction: column;
  gap: var(--ats-field-label-gap);
  min-width: 0;
  color: var(--color-ink);
}

.ats-field--disabled {
  opacity: var(--opacity-disabled);
}

.ats-field__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-xs);
}

.ats-field__required {
  margin-left: var(--space-1);
}

.ats-field__message {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
  overflow-wrap: anywhere;
}

.ats-field__message--helper {
  color: var(--color-muted);
}

.ats-field__message--error {
  color: var(--color-danger);
}
</style>
