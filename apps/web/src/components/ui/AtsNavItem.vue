<!--
  Sidebar destination (design page "01 · Foundations", ATS / Navigation item, "QA · Navigation states").
  A RouterLink that is selected while its route (or a child of it) is current, and then carries
  aria-current="page". `selected` overrides the route match when the owning shell knows better.
  Disabled renders a plain element with aria-disabled="true": no href, not in the Tab order.
  The label and any accessible text come from the caller, already translated; which items exist and in
  what order belong to the owning shell (decisions §13).
  At least 40 px high, 44 px below the mobile breakpoint. Long labels wrap beside the icon (never
  truncated) and the item grows, keeping 8 px top and bottom padding.
-->
<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';

const props = withDefaults(
  defineProps<{
    to: RouteLocationRaw;
    label: string;
    disabled?: boolean;
    /** Forces the selected state on (true) or off (false). Unset: follows the current route. */
    selected?: boolean;
  }>(),
  { disabled: false, selected: undefined },
);

defineSlots<{
  /** A 16 px icon, usually <AtsIcon />. Decorative: the label names the item. */
  icon?: () => unknown;
}>();

const isSelected = (routeActive: boolean) => props.selected ?? routeActive;
</script>

<template>
  <RouterLink v-slot="{ href, navigate, isActive }" :to="to" custom>
    <span
      v-if="disabled"
      class="ats-nav-item ats-nav-item--disabled"
      :class="{ 'ats-nav-item--selected': isSelected(isActive) }"
      aria-disabled="true"
      :aria-current="isSelected(isActive) ? 'page' : undefined"
    >
      <span v-if="$slots.icon" class="ats-nav-item__icon" aria-hidden="true"
        ><slot name="icon"
      /></span>
      <span class="ats-nav-item__label">{{ label }}</span>
    </span>
    <a
      v-else
      class="ats-nav-item"
      :class="{ 'ats-nav-item--selected': isSelected(isActive) }"
      :href="href"
      :aria-current="isSelected(isActive) ? 'page' : undefined"
      @click="navigate"
    >
      <span v-if="$slots.icon" class="ats-nav-item__icon" aria-hidden="true"
        ><slot name="icon"
      /></span>
      <span class="ats-nav-item__label">{{ label }}</span>
    </a>
  </RouterLink>
</template>

<style scoped>
.ats-nav-item {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 40px;
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-sidebar);
  color: var(--color-ink);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-sm);
  text-decoration: none;
}

.ats-nav-item:hover:not(.ats-nav-item--disabled) {
  background: var(--color-accent);
}

/* Selection keeps its surface and weight with focus and with disabled. */
.ats-nav-item--selected {
  background: var(--color-accent);
  font-weight: var(--font-weight-bold);
}

.ats-nav-item:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-nav-item--disabled {
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.ats-nav-item__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

.ats-nav-item__label {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Mobile: a 44 px tap target; the 8 px padding stays, so a wrapped label grows the item. */
@media (max-width: 767px) {
  .ats-nav-item {
    min-height: var(--touch-target-min);
    padding-block: var(--space-2);
  }
}
</style>
