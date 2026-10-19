<!--
  Dropdown action menu (design page "01 · Foundations", ATS/Menu). The caller renders its own trigger
  (usually AtsButton or AtsIconButton) in the `trigger` slot and binds the slot's `props` to it; the menu
  supplies the ARIA wiring and the open/keyboard handlers. Items are AtsMenuItem children.
  The panel (role="menu") lives in a teleport layer on <body>, fixed under the trigger, flipped above it
  when there is no room below and kept inside the viewport (so it fits a 360 px screen). It takes the
  theme of the trigger's nearest [data-theme], so a dark area keeps a dark menu.
  Keyboard: Enter, Space or Arrow Down on the trigger open it on the first item, Arrow Up on the last.
  Inside: Arrow Up/Down (wrapping) and Home/End move between enabled items, a letter moves to the next
  enabled item starting with it, Escape closes and refocuses the trigger, Tab closes and moves on.
  Clicking outside closes it. Labels come from the caller, already translated (decisions §12), and the
  caller passes only the actions the user may perform (decisions §3).
-->
<script lang="ts">
/* global document, window, Event, HTMLElement, KeyboardEvent, Node -- DOM globals */
import type { InjectionKey } from 'vue';

export interface MenuContext {
  /** Closes the menu; `focusTrigger` moves focus back to the trigger. */
  close: (focusTrigger: boolean) => void;
}

export const MENU_CONTEXT: InjectionKey<MenuContext> = Symbol('AtsMenu');

export interface AtsMenuTriggerProps {
  id: string;
  'aria-haspopup': 'menu';
  'aria-expanded': 'true' | 'false';
  'aria-controls': string | undefined;
  onClick: () => void;
  onKeydown: (event: KeyboardEvent) => void;
}
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  useId,
  useTemplateRef,
  watch,
} from 'vue';

const props = withDefaults(
  defineProps<{
    /** Optional group heading shown above the items (uppercase), which also names the menu. */
    heading?: string;
    placement?: 'bottom-start' | 'bottom-end';
  }>(),
  { heading: undefined, placement: 'bottom-start' },
);

defineSlots<{
  trigger: (scope: { props: AtsMenuTriggerProps; open: boolean }) => unknown;
  default?: () => unknown;
}>();

/** Gap between the trigger and the panel, and the minimum distance to the viewport edges. */
const OFFSET = 4;
const MARGIN = 8;

const id = useId();
const triggerId = `${id}-trigger`;
const panelId = `${id}-menu`;
const headingId = `${id}-heading`;

const open = ref(false);
const theme = ref<string | undefined>(undefined);
const position = ref({ left: 0, top: 0 });
const panel = useTemplateRef<HTMLElement>('panel');

const triggerEl = () => document.getElementById(triggerId);

const triggerProps = computed<AtsMenuTriggerProps>(() => ({
  id: triggerId,
  'aria-haspopup': 'menu',
  'aria-expanded': open.value ? 'true' : 'false',
  'aria-controls': open.value ? panelId : undefined,
  onClick,
  onKeydown: onTriggerKeydown,
}));

function enabledItems() {
  return [
    ...(panel.value?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    ) ?? []),
  ];
}

function place() {
  const trigger = triggerEl();
  const el = panel.value;
  if (!trigger || !el) return;
  const root = document.documentElement;
  const viewportWidth = root.clientWidth;
  const viewportHeight = root.clientHeight;
  const anchor = trigger.getBoundingClientRect();
  const { width, height } = el.getBoundingClientRect();

  let left = props.placement === 'bottom-end' ? anchor.right - width : anchor.left;
  left = Math.max(MARGIN, Math.min(left, viewportWidth - width - MARGIN));

  let top = anchor.bottom + OFFSET;
  const above = anchor.top - OFFSET - height;
  if (top + height > viewportHeight - MARGIN && above >= MARGIN) top = above;

  position.value = { left, top };
}

async function show(focus: 'first' | 'last') {
  theme.value = triggerEl()?.closest('[data-theme]')?.getAttribute('data-theme') ?? undefined;
  open.value = true;
  await nextTick();
  place();
  const items = enabledItems();
  (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
}

function close(focusTrigger: boolean) {
  if (!open.value) return;
  open.value = false;
  if (focusTrigger) triggerEl()?.focus();
}

provide(MENU_CONTEXT, { close });

function onClick() {
  if (open.value) close(false);
  else void show('first');
}

function onTriggerKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Enter':
    case ' ':
    case 'ArrowDown':
      event.preventDefault();
      void show('first');
      break;
    case 'ArrowUp':
      event.preventDefault();
      void show('last');
      break;
  }
}

/** The nearest enabled item from `start` in direction `step`, wrapping round the list. */
function step(items: HTMLElement[], start: number, direction: 1 | -1) {
  if (!items.length) return undefined;
  return items[(((start + direction) % items.length) + items.length) % items.length];
}

function typeahead(items: HTMLElement[], start: number, letter: string) {
  const wanted = letter.toLocaleLowerCase();
  for (let offset = 1; offset <= items.length; offset++) {
    const item = items[(start + offset) % items.length]!;
    if (item.textContent?.trim().toLocaleLowerCase().startsWith(wanted)) return item;
  }
  return undefined;
}

function onPanelKeydown(event: KeyboardEvent) {
  const items = enabledItems();
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | undefined;
  switch (event.key) {
    case 'ArrowDown':
      next = step(items, current, 1);
      break;
    case 'ArrowUp':
      next = step(items, current < 0 ? items.length : current, -1);
      break;
    case 'Home':
      next = items[0];
      break;
    case 'End':
      next = items[items.length - 1];
      break;
    case 'Escape':
      event.preventDefault();
      close(true);
      return;
    case 'Enter':
    case ' ':
      // Handled here rather than on each item, so links and buttons select the same way.
      event.preventDefault();
      (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="menuitem"]')?.click();
      return;
    case 'Tab':
      // Focus goes back to the trigger first, so the browser's Tab moves on from there.
      close(true);
      return;
    default:
      if (
        event.key.length === 1 &&
        event.key !== ' ' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        next = typeahead(items, current, event.key);
        break;
      }
      return;
  }
  event.preventDefault();
  next?.focus();
}

function onPointerdown(event: Event) {
  const target = event.target as Node | null;
  if (!target) return;
  if (panel.value?.contains(target) || triggerEl()?.contains(target)) return;
  close(false);
}

function reposition() {
  place();
}

function listen(on: boolean) {
  const method = on ? 'addEventListener' : 'removeEventListener';
  document[method]('pointerdown', onPointerdown, true);
  window[method]('resize', reposition);
  window[method]('scroll', reposition, true);
}

watch(open, (isOpen) => listen(isOpen));
onBeforeUnmount(() => listen(false));
</script>

<template>
  <slot name="trigger" :props="triggerProps" :open="open" />
  <Teleport to="body">
    <div
      v-if="open"
      :id="panelId"
      ref="panel"
      class="ats-menu"
      role="menu"
      :aria-labelledby="heading ? headingId : triggerId"
      :data-theme="theme"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @keydown="onPanelKeydown"
    >
      <div v-if="heading" :id="headingId" class="ats-menu__heading" aria-hidden="true">
        {{ heading }}
      </div>
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
/*
 * Panel from "ATS/Menu": 1 px line border on the surface, inset 12, items 4 apart, heading 4 above
 * them. At least 232 px wide, never wider than the viewport minus 8 px on each side.
 */
.ats-menu {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  box-sizing: border-box;
  min-width: 232px;
  max-width: calc(100vw - 2 * var(--space-2));
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-family-sans);
}

.ats-menu__heading {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
</style>
