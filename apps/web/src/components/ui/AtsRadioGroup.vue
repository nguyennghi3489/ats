<!--
  One-of-many choice (design page "01 · Foundations", ATS / Radio option). A <fieldset> named by its
  <legend> holding AtsRadio options in the default slot; v-model is the selected option's value.
  Options are native radios sharing `name`. The arrow keys move the selection to the next or previous
  enabled option and wrap, the same as the browser default, handled here so every engine agrees.
  `error` (already translated) marks every option invalid, describes it with the message and shows the
  message below the options. All text comes from the caller.
-->
<script lang="ts">
import type { ComputedRef, InjectionKey } from 'vue';

export interface RadioGroupContext {
  name: ComputedRef<string>;
  selected: ComputedRef<string | undefined>;
  disabled: ComputedRef<boolean>;
  invalid: ComputedRef<boolean>;
  describedBy: ComputedRef<string | undefined>;
  select(value: string): void;
}

export const radioGroupKey: InjectionKey<RadioGroupContext> = Symbol('AtsRadioGroup');
</script>

<script setup lang="ts">
/* global KeyboardEvent, HTMLInputElement, HTMLFieldSetElement -- DOM types, which no-undef does not know in .vue files */
import { computed, provide, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Shared `name` of the native radios. */
    name: string;
    /** Group name, shown above the options and read out by assistive technology. */
    legend: string;
    /** Keep the legend as the accessible name but hide it visually. */
    hideLegend?: boolean;
    disabled?: boolean;
    /** Error message (already translated). Marks every option invalid. */
    error?: string;
  }>(),
  {
    hideLegend: false,
    disabled: false,
    error: undefined,
  },
);

const model = defineModel<string>();

defineSlots<{ default(): unknown }>();

const errorId = `${useId()}-error`;
const invalid = computed(() => Boolean(props.error));

function select(value: string) {
  if (props.disabled) return;
  model.value = value;
}

provide(radioGroupKey, {
  name: computed(() => props.name),
  selected: computed(() => model.value),
  disabled: computed(() => props.disabled),
  invalid,
  describedBy: computed(() => (invalid.value ? errorId : undefined)),
  select,
});

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

function onKeydown(event: KeyboardEvent) {
  const step = STEP[event.key];
  const target = event.target;
  if (!step || !(target instanceof HTMLInputElement) || target.type !== 'radio') return;
  const fieldset = event.currentTarget as HTMLFieldSetElement;
  const radios = [...fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
    (radio) => radio.name === props.name && !radio.disabled,
  );
  const index = radios.indexOf(target);
  if (index === -1) return;
  event.preventDefault();
  const next = radios[(index + step + radios.length) % radios.length];
  if (!next) return;
  next.focus();
  select(next.value);
}
</script>

<template>
  <fieldset
    class="ats-radio-group"
    :class="{ 'ats-radio-group--error': invalid, 'ats-radio-group--disabled': disabled }"
    @keydown="onKeydown"
  >
    <legend
      class="ats-radio-group__legend"
      :class="{ 'ats-radio-group__legend--hidden': hideLegend }"
    >
      {{ legend }}
    </legend>
    <div class="ats-radio-group__options">
      <slot />
    </div>
    <p v-if="invalid" :id="errorId" class="ats-radio-group__error">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.ats-radio-group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--color-ink);
}

/* Caption to control gap from "QA · Radio states". */
.ats-radio-group__legend {
  margin: 0 0 var(--space-2);
  padding: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-xs);
  overflow-wrap: anywhere;
}

.ats-radio-group__legend--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.ats-radio-group__options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

/* The error sits below the group, clear of the 3 px focus ring on the last option. */
.ats-radio-group__error {
  margin: var(--space-4) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
  overflow-wrap: anywhere;
}

@media (max-width: 767px) {
  .ats-radio-group__options {
    gap: var(--space-2);
  }
}
</style>
