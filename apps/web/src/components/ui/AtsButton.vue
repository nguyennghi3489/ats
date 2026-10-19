<!--
  The ATS button (design page "01 · Foundations", ATS / Button). Primary for the main action, Outline for
  secondary ones. The label is the default slot and comes from the caller, already translated.
  Pending shows the spinner before the label, sets aria-busy and swallows clicks (so a form is not
  submitted twice) while the button keeps its focus. Disabled is the native attribute: no focus, no click.
-->
<script setup lang="ts">
/* global MouseEvent -- DOM type, which no-undef does not know in .vue files */
import AtsIcon from './AtsIcon.vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'outline';
    type?: 'button' | 'submit';
    disabled?: boolean;
    pending?: boolean;
    /** Full width of the parent. */
    block?: boolean;
  }>(),
  { variant: 'primary', type: 'button', disabled: false, pending: false, block: false },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(event: MouseEvent) {
  if (props.pending) {
    // Blocks the duplicate activation, including the form submit of a type="submit" button.
    event.preventDefault();
    return;
  }
  emit('click', event);
}
</script>

<template>
  <button
    class="ats-button"
    :class="[
      `ats-button--${variant}`,
      { 'ats-button--block': block, 'ats-button--pending': pending },
    ]"
    :type="type"
    :disabled="disabled"
    :aria-busy="pending ? 'true' : undefined"
    @click="onClick"
  >
    <AtsIcon v-if="pending" name="spinner" />
    <span class="ats-button__label"><slot /></span>
  </button>
</template>

<style scoped>
/*
 * Desktop 36 px high, inset 4/16 (the 1 px border brings a 20 px line to 36), gap 8. Below the mobile
 * breakpoint: at least the touch target, labels wrap and stay centred.
 * `data-state` forces a look in the dev gallery only; product code never sets it.
 */
.ats-button {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: var(--space-1) var(--space-4);
  border: 1px solid;
  border-radius: var(--radius-sm);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-sm);
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
}

.ats-button--primary {
  border-color: var(--color-action-line);
  background: var(--color-action);
  color: var(--color-action-ink);
}

.ats-button--outline {
  border-color: var(--color-line);
  background: var(--color-control);
  color: var(--color-ink);
}

.ats-button--block {
  display: flex;
  width: 100%;
}

.ats-button:not(:disabled, .ats-button--pending):hover,
.ats-button[data-state='hover'] {
  border-color: var(--color-line);
  background: var(--color-accent);
  color: var(--color-ink);
}

.ats-button:not(:disabled, .ats-button--pending):active,
.ats-button[data-state='pressed'] {
  border-color: var(--color-action-line);
  background: var(--color-accent);
  color: var(--color-ink);
}

/* Drawn inside the border box, so the hit area and outer size never change. */
.ats-button:focus-visible,
.ats-button[data-state='focus'] {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.ats-button:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.ats-button--pending {
  cursor: progress;
}

.ats-button__label {
  min-width: 0;
}

@media (max-width: 767px) {
  .ats-button {
    min-height: var(--touch-target-min);
    white-space: normal;
    overflow-wrap: break-word;
  }
}
</style>
