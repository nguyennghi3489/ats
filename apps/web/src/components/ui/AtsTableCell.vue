<!--
  Two-line table cell (design page "01 · Foundations", ATS/Table cell): the primary text, and optional
  secondary text 4 px below it in the muted colour. Both wrap; nothing is truncated. Put it in an
  AtsTable `#cell-<key>` slot. The text comes from the caller, already translated or masked (§13).
-->
<script setup lang="ts">
defineProps<{
  primary: string;
  secondary?: string;
}>();
</script>

<template>
  <div class="ats-table-cell">
    <div class="ats-table-cell__primary">{{ primary }}</div>
    <div v-if="secondary" class="ats-table-cell__secondary">{{ secondary }}</div>
  </div>
</template>

<style scoped>
.ats-table-cell {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ats-table-cell__primary {
  color: var(--color-ink);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
}

.ats-table-cell__secondary {
  margin-top: var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}
</style>
