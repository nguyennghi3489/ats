<!--
  Shared layout for the pre-sign-in pages (design page "03 · Authentication and onboarding", desktop
  examples and the AUTH / SIGN / REC screens): a card centred on the canvas with the "A" brand mark and
  brand name, the page title and subtitle, the form in the default slot and links in the `footer` slot.
  The VI / EN switch sits right-aligned in the card header (decisions §12; not in the design yet).
  Title and subtitle come from the caller, already translated.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LanguageSwitch from './LanguageSwitch.vue';

defineProps<{
  title: string;
  subtitle?: string;
}>();

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <div class="auth-layout">
    <main class="auth-layout__card">
      <header class="auth-layout__header">
        <div class="auth-layout__brand" data-testid="auth-brand">
          <span class="auth-layout__mark" aria-hidden="true">A</span>
          <span class="auth-layout__brand-name">{{ t('auth.layout.brand') }}</span>
        </div>
        <LanguageSwitch />
      </header>

      <div class="auth-layout__intro">
        <h1 class="auth-layout__title">{{ title }}</h1>
        <p v-if="subtitle" class="auth-layout__subtitle" data-testid="auth-subtitle">
          {{ subtitle }}
        </p>
      </div>

      <div class="auth-layout__body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="auth-layout__footer">
        <slot name="footer" />
      </footer>
    </main>
  </div>
</template>

<style scoped>
/*
 * Desktop: a 448 px card, 32 px inset, centred on the canvas. Below the mobile breakpoint the card
 * fills the width inside a 16 px page padding with a 24 px inset.
 */
.auth-layout {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--space-8) var(--space-4);
  background: var(--color-canvas);
  color: var(--color-ink);
}

.auth-layout__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 448px;
  min-width: 0;
  padding: var(--space-8);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.auth-layout__header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.auth-layout__brand {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
}

.auth-layout__mark {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
}

.auth-layout__brand-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-sm);
  overflow-wrap: anywhere;
}

.auth-layout__intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.auth-layout__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-lg);
  overflow-wrap: break-word;
}

.auth-layout__subtitle {
  color: var(--color-muted);
  overflow-wrap: break-word;
}

.auth-layout__body {
  min-width: 0;
}

.auth-layout__footer {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

@media (max-width: 767px) {
  .auth-layout {
    place-items: start center;
    padding: var(--space-4);
  }

  .auth-layout__card {
    padding: var(--space-6);
  }
}
</style>
