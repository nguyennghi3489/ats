<!--
  Gallery demo (/dev/ui): Primary and Outline in every state, plus a long label. Hover, Pressed and Focus
  are forced with data-state so they show without a pointer; hover, press and Tab still work on every
  button. Developer tooling, not product copy: no i18n here.
-->
<script setup lang="ts">
import AtsButton from './AtsButton.vue';

const variants = ['primary', 'outline'] as const;
const states = [
  { id: 'default', title: 'Default' },
  { id: 'hover', title: 'Hover' },
  { id: 'focus', title: 'Focus' },
  { id: 'disabled', title: 'Disabled' },
  { id: 'pressed', title: 'Pressed' },
  { id: 'pending', title: 'Pending' },
] as const;
const forced = new Set<string>(['hover', 'focus', 'pressed']);
</script>

<template>
  <div class="button-demo">
    <div v-for="variant in variants" :key="variant" class="button-demo__row">
      <div v-for="state in states" :key="state.id" class="button-demo__item">
        <span class="button-demo__caption">{{ variant }} · {{ state.title }}</span>
        <AtsButton
          :variant="variant"
          :disabled="state.id === 'disabled'"
          :pending="state.id === 'pending'"
          :data-state="forced.has(state.id) ? state.id : undefined"
          :data-testid="`button-${variant}-${state.id}`"
        >
          Lưu thay đổi
        </AtsButton>
      </div>
    </div>

    <div class="button-demo__long">
      <span class="button-demo__caption">Long label · block</span>
      <AtsButton block data-testid="button-long">Lưu thay đổi có nội dung dài</AtsButton>
      <AtsButton block variant="outline" data-testid="button-long-outline">
        Lưu thay đổi có nội dung dài
      </AtsButton>
      <AtsButton block pending data-testid="button-long-pending">
        Đang lưu thay đổi có nội dung dài
      </AtsButton>
    </div>
  </div>
</template>

<style scoped>
.button-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.button-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.button-demo__item,
.button-demo__long {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.button-demo__long {
  align-items: stretch;
  gap: var(--space-2);
}

.button-demo__caption {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}
</style>
