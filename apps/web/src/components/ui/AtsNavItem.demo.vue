<!--
  Gallery demo (/dev/ui): every state from "QA · Navigation states". Selection is pinned with the
  `selected` prop so it does not depend on the gallery's own route; hover and focus are pinned with
  demo-only classes so they can be compared side by side (the real states come from :hover and
  :focus-visible in AtsNavItem). Sample labels are synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
import AtsIcon from './AtsIcon.vue';
import AtsNavItem from './AtsNavItem.vue';

const TO = '/';
const LABEL = 'Ứng tuyển';
const LONG_LABEL = 'Ứng tuyển được phân công cần xem xét hôm nay';

const states = [
  { id: 'default', title: 'Default · Unselected', selected: false, disabled: false },
  { id: 'hover', title: 'Hover · Unselected', selected: false, disabled: false },
  { id: 'focus', title: 'Focus · Unselected', selected: false, disabled: false },
  { id: 'selected', title: 'Default · Selected', selected: true, disabled: false },
  { id: 'focus-selected', title: 'Focus · Selected', selected: true, disabled: false },
  { id: 'disabled', title: 'Disabled · Unselected', selected: false, disabled: true },
  { id: 'disabled-selected', title: 'Disabled · Selected', selected: true, disabled: true },
  { id: 'long', title: 'Long label · Unselected', selected: false, disabled: false },
  {
    id: 'long-focus-selected',
    title: 'Long label · Focus · Selected',
    selected: true,
    disabled: false,
  },
  {
    id: 'long-disabled-selected',
    title: 'Long label · Disabled · Selected',
    selected: true,
    disabled: true,
  },
] as const;
</script>

<template>
  <div class="nav-item-demo">
    <section
      v-for="state in states"
      :key="state.id"
      :data-state="state.id"
      :class="{
        'nav-item-demo--hover': state.id === 'hover',
        'nav-item-demo--focus': state.id.includes('focus'),
      }"
    >
      <h4 class="nav-item-demo__state">{{ state.title }}</h4>
      <AtsNavItem
        :to="TO"
        :label="state.id.startsWith('long') ? LONG_LABEL : LABEL"
        :selected="state.selected"
        :disabled="state.disabled"
      >
        <template #icon><AtsIcon name="archive-box" /></template>
      </AtsNavItem>
    </section>
  </div>
</template>

<style scoped>
.nav-item-demo {
  display: grid;
  gap: var(--space-3);
  max-width: 320px;
}

.nav-item-demo__state {
  margin: 0 0 var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

/* Demo-only copies of the :hover and :focus-visible rules in AtsNavItem.vue. */
.nav-item-demo--hover :deep(.ats-nav-item) {
  background: var(--color-accent);
}

.nav-item-demo--focus :deep(.ats-nav-item) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
