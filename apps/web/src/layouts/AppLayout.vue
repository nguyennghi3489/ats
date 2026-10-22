<!--
  Desktop app layout for the signed-in, workspace-scoped pages (design page "02 · App shell",
  ATS/App chrome/Desktop and the desktop examples): the fixed 224 px sidebar and a scrolling main area
  holding the routed page. The page header, tabs and body belong to each page, not to this chrome.
  The `workspace` and `account` slots are passed to the sidebar for the workspace and account menus;
  without an `account` slot the sidebar gets the account menu (AccountMenu.vue).
  Below 768 px the sidebar is not shown (the mobile top bar replaces it).
  The role comes from the active workspace in the workspace store, loaded here when nobody has yet.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '../features/auth/session.store';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import AccountMenu from './AccountMenu.vue';
import AppSidebar from './AppSidebar.vue';

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
</script>

<template>
  <div class="app-layout" data-testid="app-layout">
    <AppSidebar class="app-layout__sidebar" :role="role" :user-name="userName">
      <template v-if="$slots.workspace" #workspace><slot name="workspace" /></template>
      <template #account>
        <slot name="account"><AccountMenu /></slot>
      </template>
    </AppSidebar>
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

@media (max-width: 767px) {
  .app-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-layout__sidebar {
    display: none;
  }
}
</style>
