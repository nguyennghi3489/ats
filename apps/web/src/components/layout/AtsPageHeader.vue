<!--
  The generic list-page header (design page "02 · App shell", ATS/Page wrapper and the Example screens):
  the page title as the page's only h1, an optional muted description, the `actions` slot right-aligned on
  the title row and an optional `breadcrumb` slot above the title. Text comes from the caller, already
  translated; the breadcrumb caller brings its own <nav> and links.
  Below the mobile breakpoint the title comes first, the description is hidden and the actions stack
  under the title at full width (Example · Mobile navigation closed).
  The job record header (code, badges, tabs) is not this component: it belongs to the job page.
-->
<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="ats-page-header">
    <div v-if="$slots.breadcrumb" class="ats-page-header__breadcrumb">
      <slot name="breadcrumb" />
    </div>
    <div class="ats-page-header__row">
      <div class="ats-page-header__heading">
        <h1 class="ats-page-header__title">{{ title }}</h1>
        <p v-if="description" class="ats-page-header__description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="ats-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
/*
 * Desktop: inset 32 top, 40 sides, 24 bottom, closed by a 1 px line. The title and description stack
 * with an 8 px gap; the actions sit on the right, centred on that block, and never shrink, so a long
 * title wraps beside them instead of running under them.
 * Below 768 px: inset 24 top and 20 sides, no line, title then full-width actions 12 px below it.
 */
.ats-page-header {
  box-sizing: border-box;
  min-width: 0;
  padding: var(--space-8) 40px var(--space-6);
  border-bottom: 1px solid var(--color-line);
  color: var(--color-ink);
}

.ats-page-header__breadcrumb {
  margin-bottom: var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
  overflow-wrap: anywhere;
}

.ats-page-header__row {
  display: flex;
  gap: var(--space-6);
  align-items: center;
  justify-content: space-between;
}

.ats-page-header__heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.ats-page-header__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xl);
  overflow-wrap: anywhere;
}

.ats-page-header__description {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  overflow-wrap: anywhere;
}

.ats-page-header__actions {
  display: flex;
  flex: none;
  gap: var(--space-2);
  align-items: center;
}

@media (max-width: 767px) {
  .ats-page-header {
    padding: var(--space-6) 20px 0;
    border-bottom: 0;
  }

  .ats-page-header__row {
    flex-direction: column;
    gap: var(--space-3);
    align-items: stretch;
  }

  .ats-page-header__description {
    display: none;
  }

  .ats-page-header__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
