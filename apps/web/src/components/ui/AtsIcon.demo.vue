<!-- Gallery demo (/dev/ui): every icon at its design size, in the panel's text colour. -->
<script setup lang="ts">
import AtsIcon from './AtsIcon.vue';
import { ICON_NAMES, ICONS } from './icons';
</script>

<template>
  <ul class="icon-demo">
    <li v-for="name in ICON_NAMES" :key="name" class="icon-demo__item">
      <AtsIcon :name="name" :size="ICONS[name].grid" />
      <code class="icon-demo__name">{{ name }}</code>
    </li>
  </ul>
</template>

<style scoped>
.icon-demo {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.icon-demo__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
}

.icon-demo__name {
  font-size: var(--font-size-xs);
}
</style>
