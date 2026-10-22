<!--
  Stand-in for an app page whose feature has not landed yet: a centred empty state saying the page
  is coming soon. Each feature issue replaces its route's component (router/index.ts).
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AtsEmptyState from '../components/ui/AtsEmptyState.vue';

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <div class="placeholder-view" data-testid="placeholder-page">
    <AtsEmptyState
      :title="t('shell.placeholder.title')"
      :description="t('shell.placeholder.description')"
      :heading-level="1"
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
