<!--
  Stand-in for an app page whose feature has not landed yet: a centred empty state saying the page
  is coming soon. Each feature issue replaces its route's component (router/index.ts).
  `headingLevel` is 1 for a whole page; inside a page that has its own h1 (a job tab) the route passes 2.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AtsEmptyState from '../components/ui/AtsEmptyState.vue';

withDefaults(defineProps<{ headingLevel?: 1 | 2 }>(), { headingLevel: 1 });

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <div class="placeholder-view" data-testid="placeholder-page">
    <AtsEmptyState
      :title="t('shell.placeholder.title')"
      :description="t('shell.placeholder.description')"
      :heading-level="headingLevel"
    />
  </div>
</template>

<style scoped>
.placeholder-view {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: var(--space-8) var(--space-4);
}
</style>
