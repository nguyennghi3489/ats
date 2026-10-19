<!--
  Modal dialog (design page "01 · Foundations", ATS/Dialog): a title with the close Icon button, the body
  (default slot) and the actions (`footer` slot, AtsButton components from the caller, primary last).
  Built on the native <dialog> opened with showModal(), so the page behind is inert and the backdrop is
  drawn by the browser. Focus moves to the first focusable element in the body or footer (or the dialog
  itself), Tab and Shift+Tab wrap inside it, and focus returns to the opener on close. Escape and the
  close button close it unless `dismissible` is false or `pending` is true; a backdrop click never does.
  The page does not scroll while it is open; a tall body scrolls inside the dialog.
  Title, close label and actions come from the caller, already translated (decisions §12).
-->
<script lang="ts">
/* global document, Event, HTMLDialogElement, HTMLElement, KeyboardEvent -- DOM globals */

/** Open dialogs holding the page scroll lock, and the overflow value to restore after the last. */
let scrollLocks = 0;
let savedOverflow = '';

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
}

function unlockScroll() {
  if (scrollLocks > 0 && --scrollLocks === 0) {
    document.documentElement.style.overflow = savedOverflow;
  }
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue';
import AtsIconButton from './AtsIconButton.vue';

const props = withDefaults(
  defineProps<{
    /** Dialog title, already translated. Names the dialog. */
    title: string;
    /** Accessible name of the close button, already translated. */
    closeLabel: string;
    /** Escape and the close button close the dialog. False hides the close button. */
    dismissible?: boolean;
    /** An action is running: Escape and the close button do nothing. */
    pending?: boolean;
    /**
     * Renders the dialog in the page flow instead of as a modal (no backdrop, focus or scroll
     * handling). For static specimens such as the dev gallery; product screens never set it.
     */
    inline?: boolean;
  }>(),
  { dismissible: true, pending: false, inline: false },
);

const open = defineModel<boolean>('open', { default: false });

const slots = defineSlots<{
  default?: () => unknown;
  footer?: () => unknown;
}>();

const id = useId();
const titleId = `${id}-title`;
const bodyId = `${id}-body`;

const dialog = useTemplateRef<HTMLDialogElement>('dialog');
let opener: HTMLElement | null = null;
let locked = false;

const canClose = () => props.dismissible && !props.pending;

function focusables() {
  return [...(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
}

function requestClose() {
  if (canClose()) open.value = false;
}

async function show() {
  const el = dialog.value;
  if (!el || el.open) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el.showModal();
  if (!locked) {
    lockScroll();
    locked = true;
  }
  await nextTick();
  const scope = (part: string) => FOCUSABLE.split(',').map((sel) => `.ats-dialog__${part} ${sel}`);
  const first = dialog.value?.querySelector<HTMLElement>(
    [...scope('body'), ...scope('footer')].join(','),
  );
  (first ?? dialog.value)?.focus();
}

function hide() {
  const el = dialog.value;
  if (el?.open) el.close();
  if (locked) {
    unlockScroll();
    locked = false;
  }
  const target = opener;
  opener = null;
  if (target?.isConnected) target.focus();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Prevents the browser's own cancel, so `dismissible` and `pending` decide.
    event.preventDefault();
    requestClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables();
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const outside = !items.includes(active as HTMLElement);
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
  }
}

/** The browser's close request (Escape, Android back): always ours to decide. */
function onCancel(event: Event) {
  event.preventDefault();
  requestClose();
}

/** The browser closed the dialog by itself: keep it open if that is not allowed. */
function onClose() {
  if (!open.value || props.inline) return;
  if (canClose()) {
    open.value = false;
  } else {
    dialog.value?.showModal();
  }
}

watch(open, (isOpen) => {
  if (props.inline) return;
  if (isOpen) void show();
  else hide();
});

onMounted(() => {
  if (open.value && !props.inline) void show();
});

onBeforeUnmount(() => {
  if (locked) {
    unlockScroll();
    locked = false;
  }
});
</script>

<template>
  <dialog
    ref="dialog"
    class="ats-dialog"
    :class="{ 'ats-dialog--inline': inline }"
    :open="inline ? open : undefined"
    :aria-labelledby="titleId"
    :aria-describedby="bodyId"
    tabindex="-1"
    @keydown="onKeydown"
    @cancel="onCancel"
    @close="onClose"
  >
    <div class="ats-dialog__frame">
      <header class="ats-dialog__header">
        <h2 :id="titleId" class="ats-dialog__title">{{ title }}</h2>
        <AtsIconButton
          v-if="dismissible"
          class="ats-dialog__close"
          icon="close"
          :label="closeLabel"
          :disabled="pending"
          @click="requestClose"
        />
      </header>
      <div :id="bodyId" class="ats-dialog__body">
        <slot />
      </div>
      <div v-if="slots.footer" class="ats-dialog__footer">
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/*
 * "QA · Dialog assembled spacing": desktop 520 wide with an outer inset of 24; below the mobile
 * breakpoint min(328 px, 100vw − 32 px) with an inset of 20 and the actions stacked full width (the
 * caller passes the primary action last). Header gap 12, section gap 16, footer top inset 8, action
 * gap 8. The height hugs the content; when that is taller than the viewport the body scrolls and the
 * footer stays in view. The narrow layout follows the dialog's own width (a container query), so the
 * inline specimen in the gallery's 360 px panel takes it too.
 */
.ats-dialog {
  container: ats-dialog / inline-size;
  box-sizing: border-box;
  width: 520px;
  max-width: calc(100vw - 2 * var(--space-4));
  max-height: calc(100dvh - 2 * var(--space-4));
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-family-sans);
}

.ats-dialog[open] {
  display: flex;
  flex-direction: column;
}

.ats-dialog:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
}

/* Dims the page behind with its own canvas colour, so it follows the theme. */
.ats-dialog::backdrop {
  background: color-mix(in srgb, var(--color-canvas) 72%, transparent);
}

.ats-dialog--inline {
  position: static;
  width: min(520px, 100%);
  max-width: 100%;
  max-height: none;
  margin: 0;
}

.ats-dialog__frame {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  padding: var(--space-6);
}

.ats-dialog__header {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
}

.ats-dialog__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-lg);
  overflow-wrap: break-word;
}

.ats-dialog__body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  overflow-wrap: break-word;
}

.ats-dialog__body > :deep(:first-child) {
  margin-top: 0;
}

.ats-dialog__body > :deep(:last-child) {
  margin-bottom: 0;
}

.ats-dialog__footer {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-top: var(--space-2);
}

.ats-dialog__footer > :slotted(*) {
  min-width: 160px;
}

@media (max-width: 767px) {
  .ats-dialog {
    width: min(328px, 100vw - 32px);
  }
}

@container ats-dialog (max-width: 400px) {
  .ats-dialog__frame {
    padding: 20px;
  }

  .ats-dialog__footer {
    flex-direction: column;
  }

  .ats-dialog__footer > :slotted(*) {
    width: 100%;
    min-width: 0;
    min-height: var(--touch-target-min);
  }

  /* Touch-target sizes, as the buttons take below the mobile breakpoint (also in the gallery). */
  .ats-dialog__close {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
  }
}
</style>
