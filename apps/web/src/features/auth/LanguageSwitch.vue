<!--
  VI / EN switch for the pre-sign-in pages (decisions §12). Two toggle buttons in a labelled group; the
  active language is pressed. Picking one goes through setLocale, which updates vue-i18n, <html lang> and
  the choice stored on this device. Not in the design yet (designer update pending, decisions §17).
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { type Locale, setLocale } from '../../i18n';

const { t, locale } = useI18n({ useScope: 'global' });

const options = [
  { code: 'vi', label: 'auth.layout.vi', name: 'auth.layout.viName' },
  { code: 'en', label: 'auth.layout.en', name: 'auth.layout.enName' },
] as const satisfies ReadonlyArray<{ code: Locale; label: string; name: string }>;

function select(code: Locale) {
  if (locale.value !== code) setLocale(code);
}
</script>

<template>
  <div class="language-switch" role="group" :aria-label="t('auth.layout.language')">
    <button
      v-for="option in options"
      :key="option.code"
      type="button"
      class="language-switch__option"
      :lang="option.code"
      :aria-label="t(option.name)"
      :aria-pressed="locale === option.code ? 'true' : 'false'"
      @click="select(option.code)"
    >
      {{ t(option.label) }}
    </button>
  </div>
</template>

<style scoped>
/* Segmented control: 36 px high on desktop, the touch target on mobile. */
.language-switch {
  display: inline-flex;
  flex: none;
}

.language-switch__option {
  min-width: 40px;
  min-height: 36px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: 0;
  background: var(--color-control);
  color: var(--color-muted);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-xs);
  cursor: pointer;
}

.language-switch__option:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.language-switch__option:last-child {
  margin-left: -1px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.language-switch__option:hover {
  background: var(--color-accent);
  color: var(--color-ink);
}

.language-switch__option[aria-pressed='true'] {
  position: relative;
  border-color: var(--color-action-line);
  background: var(--color-accent);
  color: var(--color-ink);
}

/* Drawn inside the border box, so the hit area and outer size never change. */
.language-switch__option:focus-visible {
  position: relative;
  z-index: 1;
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

@media (max-width: 767px) {
  .language-switch__option {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
  }
}
</style>
