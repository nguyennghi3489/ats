<!--
  The ATS icon button (design page "01 · Foundations", ATS / Icon button): a square outline button that
  shows one icon, for compact actions such as delete, edit and close. `label` is mandatory and is its
  only name (aria-label and the native title); it comes from the caller, already translated, and is
  never shown as text. Pending swaps the icon for the spinner, sets aria-busy and swallows clicks while
  the button keeps its focus. Disabled is the native attribute: no focus, no click.
-->
<script setup lang="ts">
/* global MouseEvent -- DOM type, which no-undef does not know in .vue files */
import AtsIcon from './AtsIcon.vue';
import type { IconName } from './icons';

const props = withDefaults(
  defineProps<{
    icon: IconName;
    /** Accessible name, already translated. Used as aria-label and title. */
    label: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
    pending?: boolean;
  }>(),
  { type: 'button', disabled: false, pending: false },
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
    class="ats-icon-button"
    :class="{ 'ats-icon-button--pending': pending }"
    :type="type"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    :aria-busy="pending ? 'true' : undefined"
    @click="onClick"
  >
    <AtsIcon :name="pending ? 'spinner' : icon" />
  </button>
</template>

<style scoped>
/*
 * Desktop 36 × 36, mobile 44 × 44 (the touch target); the 16 px icon is centred. The 1 px border and
 * the inset focus ring are inside the box, so no state moves the geometry.
 * `data-state` forces a look in the dev gallery only; product code never sets it.
 */
.ats-icon-button {
  box-sizing: border-box;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-control);
  color: var(--color-ink);
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
}

.ats-icon-button:not(:disabled, .ats-icon-button--pending):hover,
.ats-icon-button[data-state='hover'] {
  background: var(--color-accent);
}

.ats-icon-button:not(:disabled, .ats-icon-button--pending):active,
.ats-icon-button[data-state='pressed'] {
  border-color: var(--color-action-line);
  background: var(--color-accent);
}

/* Drawn inside the border box, so the hit area and outer size never change. */
.ats-icon-button:focus-visible,
.ats-icon-button[data-state='focus'] {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.ats-icon-button:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.ats-icon-button--pending {
  cursor: progress;
}

@media (max-width: 767px) {
  .ats-icon-button {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
  }
}
</style>
