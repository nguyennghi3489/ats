<!--
  Small pill label (design page "01 · Foundations", ATS/Badge, "QA · Badge spacing").
  Generic tones only: which status gets which tone, and the translated text, come from the caller
  (decisions §12; stage names are data and shown as they are).
  28 px high, inset 4/12, 4 px between the optional 16 px icon and the text. The text never wraps; a
  badge wider than its container truncates with an ellipsis and keeps the full text in `title`.
  A plain non-interactive <span>: no role, no focus.
-->
<script setup lang="ts">
import { onMounted, onUpdated, useAttrs, useTemplateRef } from 'vue';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger';

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });

defineSlots<{
  /** The badge text, already translated. */
  default?: () => unknown;
  /** A 16 px icon before the text, usually <AtsIcon />. Decorative: the text names the badge. */
  icon?: () => unknown;
}>();

const attrs = useAttrs();

const root = useTemplateRef('root');
const textEl = useTemplateRef('textEl');

// The slot can hold any markup, so the title is read back from the rendered text and written
// straight to the element (no second render). A `title` passed by the caller wins.
function syncTitle() {
  if (!root.value || attrs.title !== undefined) return;
  const text = textEl.value?.textContent?.trim();
  if (text) root.value.title = text;
  else root.value.removeAttribute('title');
}

onMounted(syncTitle);
onUpdated(syncTitle);
</script>

<template>
  <span ref="root" class="ats-badge" :class="`ats-badge--${tone}`">
    <span v-if="$slots.icon" class="ats-badge__icon" aria-hidden="true"><slot name="icon" /></span>
    <span ref="textEl" class="ats-badge__text"><slot /></span>
  </span>
</template>

<style scoped>
/* The 1 px border sits inside the 28 px height, so a 16 px line is centred within the 4/12 inset. */
.ats-badge {
  display: inline-flex;
  box-sizing: border-box;
  gap: var(--space-1);
  align-items: center;
  max-width: 100%;
  height: 28px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid;
  border-radius: var(--radius-full);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
  vertical-align: middle;
}

.ats-badge--neutral {
  border-color: var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink);
}

.ats-badge--accent {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-ink);
}

.ats-badge--success {
  border-color: var(--color-success-icon);
  background: var(--color-success-surface);
  color: var(--color-success-ink);
}

.ats-badge--danger {
  border-color: var(--color-danger);
  background: var(--color-error-surface);
  color: var(--color-danger);
}

.ats-badge__icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

.ats-badge__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
