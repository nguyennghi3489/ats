<!--
  One action in an AtsMenu (design page "01 · Foundations", ATS/Menu item, "QA · Menu item states").
  role="menuitem", out of the Tab order (the menu moves focus with the arrow keys). A plain button, or a
  RouterLink when `to` is set. Selecting it (click, or Enter / Space handled by the menu) closes the menu, returns focus to the
  trigger and emits `select`; a `to` item also navigates. Disabled is aria-disabled: it stays visible,
  is skipped by the keys and emits nothing. Danger draws the label in the error colour.
  Desktop 40 px, 44 px below the mobile breakpoint; inset 8/12, icon/text gap 8. Hover and focus take
  the highlighted fill; keyboard focus adds the 3 px ring outside. The label comes from the caller,
  already translated.
-->
<script setup lang="ts">
/* global MouseEvent -- DOM type, which no-undef does not know in .vue files */
import { inject } from 'vue';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import AtsIcon from './AtsIcon.vue';
import { MENU_CONTEXT } from './AtsMenu.vue';
import type { IconName } from './icons';

const props = withDefaults(
  defineProps<{
    label: string;
    icon?: IconName;
    disabled?: boolean;
    danger?: boolean;
    to?: RouteLocationRaw;
  }>(),
  { icon: undefined, disabled: false, danger: false, to: undefined },
);

const emit = defineEmits<{ select: [event: MouseEvent] }>();

const menu = inject(MENU_CONTEXT, undefined);

function activate(event: MouseEvent, navigate?: (event?: MouseEvent) => unknown) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  // Close first, so whatever the selection opens (a dialog, a page) gets focus after the trigger.
  menu?.close(true);
  emit('select', event);
  if (navigate) void navigate(event);
}
</script>

<template>
  <RouterLink v-if="to" v-slot="{ href, navigate }" :to="to" custom>
    <a
      class="ats-menu-item"
      :class="{ 'ats-menu-item--danger': danger, 'ats-menu-item--disabled': disabled }"
      role="menuitem"
      tabindex="-1"
      :href="disabled ? undefined : href"
      :aria-disabled="disabled ? 'true' : undefined"
      @click="activate($event, navigate)"
    >
      <AtsIcon v-if="icon" class="ats-menu-item__icon" :name="icon" />
      <span class="ats-menu-item__label">{{ label }}</span>
    </a>
  </RouterLink>
  <button
    v-else
    type="button"
    class="ats-menu-item"
    :class="{ 'ats-menu-item--danger': danger, 'ats-menu-item--disabled': disabled }"
    role="menuitem"
    tabindex="-1"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="activate($event)"
  >
    <AtsIcon v-if="icon" class="ats-menu-item__icon" :name="icon" />
    <span class="ats-menu-item__label">{{ label }}</span>
  </button>
</template>

<style scoped>
/* `data-state` forces a look in the dev gallery only; product code never sets it. */
.ats-menu-item {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  min-height: 40px;
  margin: 0;
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.ats-menu-item:hover:not(.ats-menu-item--disabled),
.ats-menu-item:focus,
.ats-menu-item[data-state='hover'],
.ats-menu-item[data-state='focus'] {
  background: var(--color-accent);
  outline: none;
}

/* The ring sits outside the item, around the highlighted fill. */
.ats-menu-item:focus-visible,
.ats-menu-item[data-state='focus'] {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.ats-menu-item--disabled {
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.ats-menu-item__icon {
  flex-shrink: 0;
}

.ats-menu-item__label {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* The design keeps the icon in the ink colour; only the label turns to the error colour. */
.ats-menu-item--danger .ats-menu-item__label {
  color: var(--color-danger);
}

/* Mobile: a 44 px tap target; the 8 px padding stays, so a wrapped label grows the item. */
@media (max-width: 767px) {
  .ats-menu-item {
    min-height: var(--touch-target-min);
  }
}
</style>
