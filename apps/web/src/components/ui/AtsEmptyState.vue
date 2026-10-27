<!--
  Empty state (design page "01 · Foundations", ATS/Empty state, "QA · Empty state spacing"): a centred
  icon, title, optional description and optional action, so an empty list or a search with no results
  says what to do next. Hidden records behave like missing ones (decisions §3), so callers show the same
  empty state either way. All copy comes from the caller, already translated (decisions §12).
  The `icon` slot replaces the AtsIcon on the 64 px surface, for a glyph a screen draws itself.
  The action is the `action` slot (put an <AtsButton> in it) or, for the common case, `actionLabel`,
  which renders an AtsButton and emits `action` when it is clicked.
-->
<script setup lang="ts">
import AtsButton from './AtsButton.vue';
import AtsIcon from './AtsIcon.vue';
import type { IconName } from './icons';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** An AtsIcon name, drawn at 32 px on the 64 px surface. Decorative. */
    icon?: IconName;
    /** Heading level of the title, to fit the page outline. */
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Label of the convenience action button. Ignored when the `action` slot is used. */
    actionLabel?: string;
  }>(),
  { description: undefined, icon: 'empty', headingLevel: 2, actionLabel: undefined },
);

const emit = defineEmits<{ action: [] }>();

defineSlots<{
  /** A glyph for the icon surface, decorative. Replaces the `icon` prop's AtsIcon. */
  icon?: () => unknown;
  /** The action, usually an <AtsButton>. Replaces the `actionLabel` button. */
  action?: () => unknown;
}>();
</script>

<template>
  <div class="ats-empty-state">
    <span class="ats-empty-state__icon" aria-hidden="true">
      <slot name="icon"><AtsIcon :name="icon" :size="32" /></slot>
    </span>
    <component :is="`h${headingLevel}`" class="ats-empty-state__title">{{ title }}</component>
    <p v-if="description" class="ats-empty-state__description">{{ description }}</p>
    <div v-if="$slots.action || actionLabel" class="ats-empty-state__action">
      <slot name="action">
        <AtsButton class="ats-empty-state__button" @click="emit('action')">
          {{ actionLabel }}
        </AtsButton>
      </slot>
    </div>
  </div>
</template>

<style scoped>
/*
 * Inset 28/48 on desktop and 28/20 below the mobile breakpoint, 12 px between the parts. The copy wraps
 * inside a readable width and never pushes the container wider (no horizontal scroll at 360 px).
 */
.ats-empty-state {
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
  padding: 28px 48px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  text-align: center;
}

.ats-empty-state__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  color: var(--color-ink);
}

.ats-empty-state__title {
  max-width: 520px;
  margin: 0;
  color: var(--color-ink);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-lg);
  overflow-wrap: anywhere;
}

.ats-empty-state__description {
  max-width: 520px;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-sm);
  overflow-wrap: anywhere;
}

.ats-empty-state__action {
  display: flex;
  max-width: 100%;
  justify-content: center;
}

/* The design's action button is 160 px wide; a longer label grows it. */
.ats-empty-state__button {
  min-width: 160px;
  max-width: 100%;
}

@media (max-width: 767px) {
  .ats-empty-state {
    padding: 28px 20px;
  }
}
</style>
