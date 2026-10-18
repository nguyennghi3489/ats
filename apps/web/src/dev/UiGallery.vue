<!--
  Dev-only gallery at /dev/ui (absent from production builds, see src/router/index.ts). It collects every
  src/components/ui/**/*.demo.vue and shows each one in a light panel, a dark panel and a 360 px panel
  (the 360 px panel follows the app theme). Developer tooling, not product copy: no i18n here.
-->
<script setup lang="ts">
import type { Component } from 'vue';

const modules = import.meta.glob<Component>('../components/ui/**/*.demo.vue', {
  eager: true,
  import: 'default',
});

const demos = Object.entries(modules)
  .map(([path, component]) => ({
    name: path.replace(/^.*\//, '').replace(/\.demo\.vue$/, ''),
    component,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const panels = [
  { id: 'light', title: 'Light', theme: 'light', style: undefined },
  { id: 'dark', title: 'Dark', theme: 'dark', style: undefined },
  { id: 'mobile', title: '360 px', theme: undefined, style: { width: '360px' } },
] as const;
</script>

<template>
  <main class="ui-gallery" data-testid="ui-gallery">
    <h1 class="ui-gallery__title">UI gallery</h1>
    <section
      v-for="demo in demos"
      :key="demo.name"
      class="ui-gallery__demo"
      :data-testid="`ui-demo-${demo.name}`"
    >
      <h2 class="ui-gallery__name">{{ demo.name }}</h2>
      <div class="ui-gallery__panels">
        <div
          v-for="panel in panels"
          :key="panel.id"
          class="ui-gallery__panel"
          :data-panel="panel.id"
          :data-theme="panel.theme"
          :style="panel.style"
        >
          <h3 class="ui-gallery__panel-title">{{ panel.title }}</h3>
          <component :is="demo.component" />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.ui-gallery {
  padding: var(--space-6);
}

.ui-gallery__title {
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-xl);
}

.ui-gallery__demo + .ui-gallery__demo {
  margin-top: var(--space-8);
}

.ui-gallery__name {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-lg);
}

.ui-gallery__panels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: flex-start;
}

/* Each panel sets its own background and text colour so its data-theme takes effect inside it. */
.ui-gallery__panel {
  box-sizing: border-box;
  flex: 1 1 320px;
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  color: var(--color-ink);
}

.ui-gallery__panel[data-panel='mobile'] {
  flex: 0 0 auto;
}

.ui-gallery__panel-title {
  margin: 0 0 var(--space-3);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}
</style>
