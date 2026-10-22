<!--
  One workspace of the chooser (design "ATS/Workspace row/WS-04"): a full-width button with the
  workspace name and an arrow. Rest, hover and pressed states follow the row masters; focus draws the
  shared focus ring inside the border. Enter and Space activate it like a click.
  Differs from the design: none intended (only the name, no role badge).
-->
<script setup lang="ts">
/* global KeyboardEvent -- DOM type, which no-undef does not know in .vue files */
const props = withDefaults(defineProps<{ name: string; disabled?: boolean }>(), {
  disabled: false,
});

const emit = defineEmits<{ select: [] }>();

function onClick() {
  if (!props.disabled) emit('select');
}

// Handled here so activation never depends on the browser turning keys into clicks; preventing the
// default stops that click, so one key press selects once.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!props.disabled && !event.repeat) emit('select');
}
</script>

<template>
  <button
    type="button"
    class="workspace-row"
    :disabled="disabled"
    @click="onClick"
    @keydown="onKeydown"
  >
    <span class="workspace-row__name">{{ name }}</span>
    <span class="workspace-row__arrow" aria-hidden="true" data-testid="workspace-row-arrow">→</span>
  </button>
</template>

<style scoped>
/* 50 px high (a 20 px line, 14 px inset inside the 1 px border); the name left, the arrow top-right. */
.workspace-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  min-height: 50px;
  padding: 14px var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-sm);
  text-align: start;
  cursor: pointer;
}

.workspace-row__name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.workspace-row__arrow {
  flex: none;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.workspace-row:not(:disabled):hover {
  background: var(--color-accent);
}

.workspace-row:not(:disabled):active {
  border-color: var(--color-action-line);
  background: var(--color-accent);
}

.workspace-row:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.workspace-row:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}
</style>
