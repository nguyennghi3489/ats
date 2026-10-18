<!-- Placeholder 404 until the app shell (roadmap step 3) gives it a layout. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <main data-testid="not-found-page">
    <h1>404</h1>
    <p data-testid="not-found-title">{{ t('notFound.title') }}</p>
    <p>{{ t('notFound.description') }}</p>
    <RouterLink to="/" data-testid="not-found-home-link">{{ t('notFound.backHome') }}</RouterLink>
  </main>
</template>
