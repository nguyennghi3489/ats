<!--
  Gallery demo (/dev/ui): the icon button in every state, then the icon swap. Hover, Pressed and Focus
  are forced with data-state so they show without a pointer; hover, press and Tab still work on every
  button. In the gallery's 360 px panel the buttons take the mobile size (44 px), as on a phone; the
  component itself switches by viewport width. Developer tooling, not product copy: no i18n here.
-->
<script setup lang="ts">
import AtsIconButton from './AtsIconButton.vue';
import type { IconName } from './icons';

const states = [
  { id: 'default', title: 'Default' },
  { id: 'hover', title: 'Hover' },
  { id: 'pressed', title: 'Pressed' },
  { id: 'focus', title: 'Focus' },
  { id: 'disabled', title: 'Disabled' },
  { id: 'pending', title: 'Pending' },
] as const;
const forced = new Set<string>(['hover', 'pressed', 'focus']);

const swaps: { icon: IconName; label: string }[] = [
  { icon: 'edit', label: 'Sửa' },
  { icon: 'close', label: 'Đóng' },
  { icon: 'chevron-down', label: 'Mở rộng' },
  { icon: 'archive-box', label: 'Lưu trữ' },
];
</script>

<template>
  <div class="icon-button-demo">
    <div class="icon-button-demo__row">
      <div v-for="state in states" :key="state.id" class="icon-button-demo__item">
        <span class="icon-button-demo__caption">{{ state.title }}</span>
        <AtsIconButton
          icon="trash"
          label="Xóa"
          :disabled="state.id === 'disabled'"
          :pending="state.id === 'pending'"
          :data-state="forced.has(state.id) ? state.id : undefined"
          :data-testid="`icon-button-${state.id}`"
        />
      </div>
    </div>

    <div class="icon-button-demo__row">
      <div v-for="swap in swaps" :key="swap.icon" class="icon-button-demo__item">
        <span class="icon-button-demo__caption">{{ swap.icon }}</span>
        <AtsIconButton
          :icon="swap.icon"
          :label="swap.label"
          :data-testid="`icon-button-${swap.icon}`"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-button-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.icon-button-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.icon-button-demo__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.icon-button-demo__caption {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

/* The gallery's 360 px panel is narrow but sits on a wide viewport: show the mobile size there. */
[data-panel='mobile'] .icon-button-demo .ats-icon-button {
  width: var(--touch-target-min);
  height: var(--touch-target-min);
}
</style>
