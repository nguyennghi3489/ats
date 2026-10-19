<!--
  One option of an AtsRadioGroup (design page "01 · Foundations", ATS / Radio option): a native radio
  drawn as the design's ring (unselected) or filled disc with a dot (selected), the label beside it.
  Name, selection, error and group-wide disabled come from the enclosing AtsRadioGroup. The label is
  already translated by the caller. Attributes other than class and style go to the <input>.
-->
<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue';
import { radioGroupKey } from './AtsRadioGroup.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    value: string;
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const group = inject(radioGroupKey);
if (!group) throw new Error('AtsRadio must be used inside AtsRadioGroup');

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const controlAttrs = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')),
);

const checked = computed(() => group.selected.value === props.value);
const isDisabled = computed(() => props.disabled || group.disabled.value);
const invalid = computed(() => group.invalid.value);

function onChange() {
  if (isDisabled.value) return;
  group?.select(props.value);
}
</script>

<template>
  <label
    v-bind="rootAttrs"
    class="ats-radio"
    :class="{
      'ats-radio--checked': checked,
      'ats-radio--disabled': isDisabled,
      'ats-radio--error': invalid,
    }"
  >
    <input
      v-bind="controlAttrs"
      class="ats-radio__control"
      type="radio"
      :name="group.name.value"
      :value="value"
      :checked="checked"
      :disabled="isDisabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="group.describedBy.value"
      @change="onChange"
    />
    <span class="ats-radio__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.ats-radio {
  /* Control geometry from "ATS / Radio option": an 18 px ring, 8 px before the label. */
  --ats-radio-size: 18px;
  --ats-radio-border: 2px;
  --ats-radio-dot: 3px;

  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
  color: var(--color-ink);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  cursor: pointer;
}

.ats-radio__control {
  flex: none;
  box-sizing: border-box;
  width: var(--ats-radio-size);
  height: var(--ats-radio-size);
  /* Centres the ring on the first 20 px line of the label. */
  margin: calc((var(--line-height-sm) - var(--ats-radio-size)) / 2) 0;
  border: var(--ats-radio-border) solid var(--color-muted);
  border-radius: var(--radius-full);
  background: transparent;
  appearance: none;
  cursor: inherit;
}

.ats-radio__control:checked {
  border-color: var(--color-action-line);
  background: radial-gradient(
    circle,
    var(--color-action) 0 var(--ats-radio-dot),
    var(--color-action-line) calc(var(--ats-radio-dot) + 0.5px)
  );
}

/* Drawn outside the ring, so the control geometry never changes. */
.ats-radio__control:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-radio--error {
  color: var(--color-danger);
}

.ats-radio--error .ats-radio__control:not(:checked) {
  border-color: var(--color-danger);
}

.ats-radio--disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.ats-radio__label {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Mobile: every option is a 44 px target and long labels wrap beside the control. */
@media (max-width: 767px) {
  .ats-radio {
    align-items: center;
    min-height: var(--touch-target-min);
  }
}
</style>
