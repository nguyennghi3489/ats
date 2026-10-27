<!--
  Mobile top bar of the app shell, below 768 px (design page "02 · App shell", ATS/App chrome/Mobile,
  Example · Mobile navigation closed and open): the hamburger, the workspace menu (compact trigger: the
  name and a chevron) and, at the end, the account menu behind a round initials avatar.
  The hamburger ("Mở điều hướng" / "Đóng điều hướng") toggles MobileNav, which sits in the flow
  directly under the bar and pushes the page down. The list closes when an item is chosen, on any
  route change, and on Escape, which gives focus back to the hamburger (an Escape another control
  already handled, such as an open menu, is left alone). AppLayout renders this bar only below the
  breakpoint, so growing the viewport to 768 px or wider unmounts it and the list with it.
  The same role rules as the sidebar apply (nav-items.ts); the API enforces access (decisions §3).
-->
<script setup lang="ts">
/* global document, KeyboardEvent -- DOM globals, which no-undef does not know in .vue files */
import type { WorkspaceRole } from '@ats/shared';
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AtsIconButton from '../components/ui/AtsIconButton.vue';
import AccountMenu from './AccountMenu.vue';
import MobileNav from './MobileNav.vue';
import WorkspaceMenu from './WorkspaceMenu.vue';

defineProps<{
  /** The user's role in the active workspace; `null` without one. */
  role: WorkspaceRole | null;
}>();

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();

const id = useId();
const hamburgerId = `${id}-toggle`;
const navId = `${id}-nav`;

const open = ref(false);

function close(focusHamburger: boolean): void {
  if (!open.value) return;
  open.value = false;
  if (focusHamburger) document.getElementById(hamburgerId)?.focus();
}

function toggle(): void {
  if (open.value) close(false);
  else open.value = true;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault();
  close(true);
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', onKeydown);
  else document.removeEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

watch(
  () => route.fullPath,
  () => close(false),
);
</script>

<template>
  <div class="app-top-bar" data-testid="app-top-bar">
    <header class="app-top-bar__bar">
      <AtsIconButton
        :id="hamburgerId"
        class="app-top-bar__toggle"
        icon="menu"
        :label="t(open ? 'shell.mobileNav.close' : 'shell.mobileNav.open')"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="open ? navId : undefined"
        data-testid="app-top-bar-menu"
        @click="toggle"
      />
      <WorkspaceMenu class="app-top-bar__workspace" variant="compact" />
      <span class="app-top-bar__account">
        <AccountMenu variant="compact" />
      </span>
    </header>
    <MobileNav v-if="open" :id="navId" :role="role" @close="close(false)" />
  </div>
</template>

<style scoped>
/*
 * "ATS/App chrome/Mobile": 48 px high on the sidebar lilac with a 1 px line under it; the frameless
 * hamburger, then the workspace name, and the avatar pushed to the end. Every control is a 44 px
 * touch target. Dark: the bar sits on the canvas, like the desktop sidebar.
 */
.app-top-bar__bar {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  min-height: 48px;
  padding-inline: var(--space-1);
  border-block-end: 1px solid var(--color-line);
  background: var(--color-sidebar);
  color: var(--color-ink);
}

[data-theme='dark'] .app-top-bar__bar {
  background: var(--color-canvas);
}

.app-top-bar__toggle.app-top-bar__toggle {
  border-color: transparent;
  background: transparent;
}

.app-top-bar__workspace {
  min-width: 0;
}

.app-top-bar__account {
  display: inline-flex;
  flex-shrink: 0;
  margin-inline-start: auto;
}
</style>
