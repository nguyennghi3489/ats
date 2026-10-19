<!--
  One tab of AtsTabs (design page "01 · Foundations", ATS / Tab). `label` comes from the caller, already
  translated (stage names are data and stay as they are). `aria-controls` and any other attribute go to
  the <button role="tab">.
  Disabled uses aria-disabled rather than the native attribute, so a disabled tab that is selected stays
  focusable and the row keeps its Tab stop; clicks on it are ignored and the arrow keys skip it.
  The 2 px indicator is always rendered (transparent unless selected), so switching never shifts the row.
-->
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, useTemplateRef } from 'vue';
import { TABS_CONTEXT, type TabValue } from './AtsTabs.vue';

const props = withDefaults(
  defineProps<{
    value: TabValue;
    label: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const injected = inject(TABS_CONTEXT);
if (!injected) throw new Error('AtsTab must be used inside AtsTabs');
const tabs = injected;

const button = useTemplateRef('button');

onBeforeUnmount(
  tabs.register({
    el: () => button.value,
    value: () => props.value,
    disabled: () => props.disabled,
  }),
);

const selected = computed(() => tabs.selected.value === props.value);
const tabindex = computed(() => (tabs.focusable.value === props.value ? 0 : -1));

function onClick() {
  if (props.disabled) return;
  tabs.select(props.value);
}
</script>

<template>
  <button
    ref="button"
    class="ats-tab"
    type="button"
    role="tab"
    :aria-selected="selected ? 'true' : 'false'"
    :aria-disabled="disabled ? 'true' : undefined"
    :tabindex="tabindex"
    @click="onClick"
  >
    <span class="ats-tab__label">{{ label }}</span>
    <span class="ats-tab__indicator" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
/*
 * Desktop: inset 8/12, a 16 px line, 4 px gap, 2 px indicator: 38 px for one line, never under 36.
 * Mobile: inset 12/12: 46 px for one line, never under the 44 px touch target.
 * The label box is 72 px wide as in the design, so long labels wrap onto more lines.
 * `data-state` forces a look in the dev gallery only; product code never sets it.
 */
.ats-tab {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
  min-height: 36px;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-xs);
  text-align: left;
  cursor: pointer;
}

.ats-tab__label {
  width: calc(2 * var(--space-8) + var(--space-2));
  overflow-wrap: break-word;
}

.ats-tab__indicator {
  display: block;
  height: 2px;
  margin-top: var(--space-1);
  background: transparent;
}

.ats-tab:not([aria-disabled='true']):hover,
.ats-tab[data-state='hover'] {
  color: var(--color-ink);
}

.ats-tab[aria-selected='true'] {
  color: var(--color-ink);
  font-weight: var(--font-weight-bold);
}

.ats-tab[aria-selected='true'] .ats-tab__indicator {
  background: var(--color-action-line);
}

/* Drawn outside the tab (offset 0 from its edge), so the ring takes no room and the size never changes. */
.ats-tab:focus-visible,
.ats-tab[data-state='focus'] {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* The whole tab is dimmed, so a selected indicator keeps showing at the disabled opacity. */
.ats-tab[aria-disabled='true'] {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (max-width: 767px) {
  .ats-tab {
    min-height: var(--touch-target-min);
    padding: var(--space-3);
    white-space: normal;
  }
}
</style>
