<!--
  The content area under AtsPageHeader (design page "02 · App shell", ATS/Page wrapper):
  - `default`: padded with the page's 40 px sides (20 px below the mobile breakpoint);
  - `flush`: edge to edge, for content with its own row padding such as a table;
  - `centered`: grows to fill a flex parent and centres its content both ways, for empty states.
-->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'flush' | 'centered' }>(), {
  variant: 'default',
});
</script>

<template>
  <div class="ats-page-body" :class="`ats-page-body--${variant}`">
    <slot />
  </div>
</template>

<style scoped>
.ats-page-body {
  box-sizing: border-box;
  min-width: 0;
}

.ats-page-body--default {
  padding: var(--space-6) 40px;
}

.ats-page-body--flush {
  padding: 0;
}

.ats-page-body--centered {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) 40px;
}

@media (max-width: 767px) {
  .ats-page-body--default {
    padding: 20px;
  }

  .ats-page-body--centered {
    padding: var(--space-8) 20px;
  }
}
</style>
