<!--
  One icon from the ATS set (design page "01 · Foundations", ATS/Icon/*). It is drawn in currentColor,
  so it follows the text colour of its parent. Decorative by default (aria-hidden); pass `label` when the
  icon is the only thing that says what a control does.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from './icons';

const props = withDefaults(
  defineProps<{
    name: IconName;
    /** Rendered width and height in px. */
    size?: number;
    /** Accessible name. Without it the icon is hidden from assistive technology. */
    label?: string;
  }>(),
  { size: 16, label: undefined },
);

const icon = computed(() => ICONS[props.name]);
const a11y = computed(() =>
  props.label ? { role: 'img', 'aria-label': props.label } : { 'aria-hidden': 'true' as const },
);
</script>

<template>
  <svg
    v-if="icon"
    class="ats-icon"
    :class="{ 'ats-icon--spin': name === 'spinner' }"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${icon.grid} ${icon.grid}`"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
    v-bind="a11y"
  >
    <path v-for="d in icon.paths" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
.ats-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}

.ats-icon--spin {
  animation: ats-icon-spin 0.8s linear infinite;
}

@keyframes ats-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ats-icon--spin {
    animation: none;
  }
}
</style>
