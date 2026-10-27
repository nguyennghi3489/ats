<!--
  App layout for the signed-in, workspace-scoped pages (design page "02 · App shell"). From 768 px
  (ATS/App chrome/Desktop and the desktop examples): the fixed 224 px sidebar and a scrolling main area
  holding the routed page. Below 768 px (ATS/App chrome/Mobile): the top bar (AppTopBar) with its
  navigation list above the scrolling main area. Only one of the two is rendered at a time, following
  the viewport, so the page never holds two workspace or account menus; the stylesheet hides the
  other one too, should the media query be unavailable.
  The page header, tabs and body belong to each page, not to this chrome.
  The sidebar gets the workspace menu (WorkspaceMenu) unless the `workspace` slot replaces it, and the
  account menu (AccountMenu) unless the `account` slot replaces it.
  The role comes from the active workspace in the workspace store, loaded here when nobody has yet.
-->
<script setup lang="ts">
/* global window, MediaQueryList, MediaQueryListEvent -- DOM globals, which no-undef does not know in .vue files */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useSessionStore } from '../features/auth/session.store';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import AccountMenu from './AccountMenu.vue';
import AppSidebar from './AppSidebar.vue';
import AppTopBar from './AppTopBar.vue';
import WorkspaceMenu from './WorkspaceMenu.vue';

/** Matches the stylesheet breakpoint: the sidebar from 768 px, the top bar below. */
const DESKTOP_QUERY = '(min-width: 768px)';

defineSlots<{
  /** The workspace menu trigger, on top of the sidebar. */
  workspace?: () => unknown;
  /** The account menu trigger, next to the user's name. */
  account?: () => unknown;
}>();

const session = useSessionStore();
const workspaces = useWorkspaceStore();

if (workspaces.status === 'idle') void workspaces.load();

const role = computed(
  () =>
    workspaces.workspaces.find((workspace) => workspace.id === workspaces.activeWorkspaceId)
      ?.role ?? null,
);
const userName = computed(() => session.user?.name ?? '');

// Without matchMedia (non-browser environments) the desktop chrome is shown.
const desktopQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY)
    : null;
const desktop = ref(desktopQuery?.matches ?? true);

function onViewportChange(event: MediaQueryListEvent): void {
  desktop.value = event.matches;
}

desktopQuery?.addEventListener('change', onViewportChange);
onBeforeUnmount(() => desktopQuery?.removeEventListener('change', onViewportChange));
</script>

<template>
  <div class="app-layout" data-testid="app-layout">
    <AppSidebar v-if="desktop" class="app-layout__sidebar" :role="role" :user-name="userName">
      <template #workspace
        ><slot name="workspace"><WorkspaceMenu /></slot
      ></template>
      <template #account>
        <slot name="account"><AccountMenu /></slot>
      </template>
    </AppSidebar>
    <AppTopBar v-else class="app-layout__top-bar" :role="role" />
    <main class="app-layout__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  background: var(--color-surface);
}

.app-layout__main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-surface);
}

@media (min-width: 768px) {
  .app-layout__top-bar {
    display: none;
  }
}

/* The top bar and its open list take their height; the page scrolls in the rest. */
@media (max-width: 767px) {
  .app-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .app-layout__sidebar {
    display: none;
  }
}
</style>
