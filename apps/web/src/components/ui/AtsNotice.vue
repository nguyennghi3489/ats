<!--
  Inline feedback message (design page "01 · Foundations", ATS/Notice): an icon, an optional title and
  the message in the default slot. The caller passes translated text; the component holds none. Every
  tone has its own icon and explicit text, so it never relies on colour alone. `error` is an alert
  (announced at once); `info` and `success` are polite status messages.
-->
<script setup lang="ts">
import { computed } from 'vue';
import AtsIcon from './AtsIcon.vue';

export type NoticeTone = 'info' | 'success' | 'error';

const props = withDefaults(
  defineProps<{
    tone?: NoticeTone;
    /** Short heading above the message, already translated. */
    title?: string;
  }>(),
  { tone: 'info', title: undefined },
);

const role = computed(() => (props.tone === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div class="ats-notice" :class="`ats-notice--${tone}`" :role="role">
    <AtsIcon class="ats-notice__icon" :name="tone" :size="16" />
    <div class="ats-notice__copy">
      <p v-if="title" class="ats-notice__title">{{ title }}</p>
      <div class="ats-notice__message"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.ats-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  box-sizing: border-box;
  max-width: 100%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
}

/* Centre the 16 px icon on the first 20 px line of text. */
.ats-notice__icon {
  margin-block: calc((var(--line-height-sm) - 16px) / 2);
}

.ats-notice__copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  overflow-wrap: anywhere;
}

.ats-notice__title {
  margin: 0;
  font-weight: var(--font-weight-bold);
}

.ats-notice--info {
  background: var(--color-info-surface);
  color: var(--color-info-ink);
}

.ats-notice--success {
  background: var(--color-success-surface);
  color: var(--color-success-ink);
}

.ats-notice--success .ats-notice__icon {
  color: var(--color-success-icon);
}

/* The design draws the whole error notice (icon, title and message) in the danger colour. */
.ats-notice--error {
  background: var(--color-error-surface);
  color: var(--color-danger);
}
</style>
