<!--
  The ATS tab row (design page "01 · Foundations", ATS / Tab): a role="tablist" holding AtsTab children.
  v-model is the value of the selected tab. Selection follows focus: Arrow Left/Right move to the
  previous/next enabled tab (wrapping), Home/End to the first/last enabled one; disabled tabs are skipped.
  Only one tab is in the Tab order (roving tabindex): the selected one, or the first enabled tab when
  nothing is selected. `label` is the accessible name of the row, already translated by the caller.
-->
<script lang="ts">
/* global HTMLElement, KeyboardEvent -- DOM types, which no-undef does not know in .vue files */
import type { ComputedRef, InjectionKey } from 'vue';

export type TabValue = string | number;

export interface TabEntry {
  el: () => HTMLElement | null;
  value: () => TabValue;
  disabled: () => boolean;
}

export interface TabsContext {
  selected: ComputedRef<TabValue | undefined>;
  /** The value of the tab that carries tabindex="0". */
  focusable: ComputedRef<TabValue | undefined>;
  select: (value: TabValue) => void;
  register: (entry: TabEntry) => () => void;
}

export const TABS_CONTEXT: InjectionKey<TabsContext> = Symbol('AtsTabs');
</script>

<script setup lang="ts">
import { computed, nextTick, provide, shallowReactive, useTemplateRef } from 'vue';

defineProps<{ label: string }>();

const model = defineModel<TabValue | undefined>();

const entries = shallowReactive<TabEntry[]>([]);
const root = useTemplateRef('root');

const selected = computed(() => model.value);
const focusable = computed(() => {
  if (entries.some((entry) => entry.value() === model.value)) return model.value;
  return entries.find((entry) => !entry.disabled())?.value();
});

function select(value: TabValue) {
  model.value = value;
}

function register(entry: TabEntry) {
  entries.push(entry);
  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
  };
}

provide(TABS_CONTEXT, { selected, focusable, select, register });

/** All tabs in document order, so the keys follow what the user sees. */
function tabsInOrder() {
  const elements = [...(root.value?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
  return elements
    .map((el) => entries.find((entry) => entry.el() === el))
    .filter((entry): entry is TabEntry => !!entry);
}

/** The nearest enabled tab from `start` in direction `step`, wrapping round the row. */
function nearestEnabled(tabs: TabEntry[], start: number, step: 1 | -1) {
  for (let offset = 1; offset <= tabs.length; offset++) {
    const entry = tabs[(((start + step * offset) % tabs.length) + tabs.length) % tabs.length]!;
    if (!entry.disabled()) return entry;
  }
  return undefined;
}

async function onKeydown(event: KeyboardEvent) {
  const current = (event.target as HTMLElement | null)?.closest('[role="tab"]');
  if (!current) return;
  const tabs = tabsInOrder();
  const index = tabs.findIndex((entry) => entry.el() === current);

  let next: TabEntry | undefined;
  switch (event.key) {
    case 'ArrowRight':
      next = nearestEnabled(tabs, index, 1);
      break;
    case 'ArrowLeft':
      next = nearestEnabled(tabs, index, -1);
      break;
    case 'Home':
      next = nearestEnabled(tabs, -1, 1);
      break;
    case 'End':
      next = nearestEnabled(tabs, tabs.length, -1);
      break;
    default:
      return;
  }
  event.preventDefault();
  if (!next) return;
  select(next.value());
  await nextTick();
  next.el()?.focus();
}
</script>

<template>
  <div ref="root" class="ats-tabs" role="tablist" :aria-label="label" @keydown="onKeydown">
    <slot />
  </div>
</template>

<style scoped>
/* 96 px tabs 20 px apart (the design's 116 px pitch); the row wraps when it runs out of width. */
.ats-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) calc(var(--space-4) + var(--space-1));
  align-items: flex-start;
}
</style>
