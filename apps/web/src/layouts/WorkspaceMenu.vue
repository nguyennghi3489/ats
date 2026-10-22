<!--
  Workspace menu on top of the desktop sidebar (design page "02 · App shell", ATS/App chrome/Desktop
  open state and Example · Workspace menu open). The trigger is a full-width button: a square tile with
  the first letter of the active workspace's name, the name and a chevron. The AtsMenu under it is
  headed "Không gian làm việc" and lists the user's workspaces in the order the API returns them; the
  active one has a check and the selected fill, and is announced as current (aria-current).
  Choosing the active workspace only closes the menu. Choosing another one disables the trigger,
  switches the session's workspace (`select`), forgets every workspace's cached data
  (`clearWorkspaceCache`, decisions §3) and goes to `/jobs`, where the workspace guard reads the new
  list before any page of the new workspace renders. A refusal leaves the user where they were with
  an error notice under the trigger; `WORKSPACE_UNAVAILABLE` also reloads the list.
  The server enforces access on every request (§3); this menu only offers the switch.
  The check is a text glyph above the name, as in the design (the icon set has no bare check); it is
  hidden from assistive technology, which reads aria-current instead. No "create workspace" entry:
  the design has none here, and the chooser offers it.
-->
<script setup lang="ts">
import type { Workspace } from '@ats/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AtsIcon from '../components/ui/AtsIcon.vue';
import AtsMenu from '../components/ui/AtsMenu.vue';
import AtsMenuItem from '../components/ui/AtsMenuItem.vue';
import AtsNotice from '../components/ui/AtsNotice.vue';
import { clearWorkspaceCache } from '../features/workspaces/workspace-cache';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import { translateError } from '../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../lib/api';

const WORKSPACE_UNAVAILABLE = 'WORKSPACE_UNAVAILABLE';
/** Where a switch lands: every role has the jobs page. */
const AFTER_SWITCH_PATH = '/jobs';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();
const store = useWorkspaceStore();

/** A switch is running: the trigger stays disabled until it settles. */
const switching = ref(false);
/** Code of the last failed switch, shown in the error notice. */
const errorCode = ref<string | null>(null);

const active = computed(
  () => store.workspaces.find((workspace) => workspace.id === store.activeWorkspaceId) ?? null,
);

// The trigger keeps the last workspace it showed while the store is cleared and reloaded during a
// switch, so the name does not blink out.
const shown = ref<Workspace | null>(active.value);
watch(active, (workspace) => {
  if (workspace) shown.value = workspace;
});

const name = computed(() => shown.value?.name ?? '');
const initial = computed(() => [...name.value.trim()][0]?.toLocaleUpperCase() ?? '');

const errorText = computed(() => {
  if (!errorCode.value) return null;
  if (errorCode.value === WORKSPACE_UNAVAILABLE) return t('shell.workspaceMenu.unavailable');
  return translateError(errorCode.value);
});

function codeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
}

async function onChoose(id: string) {
  if (switching.value || id === store.activeWorkspaceId) return;
  switching.value = true;
  errorCode.value = null;
  try {
    try {
      await store.select(id);
    } catch (error) {
      const code = codeOf(error);
      if (code === WORKSPACE_UNAVAILABLE) await store.load();
      errorCode.value = code;
      return;
    }
    // Nothing of the previous workspace may be left once a page of the new one renders.
    clearWorkspaceCache();
    // `force`: on `/jobs` already, the guard must still run and read the new workspace.
    await router.push({ path: AFTER_SWITCH_PATH, force: true });
  } finally {
    switching.value = false;
  }
}
</script>

<template>
  <div class="workspace-menu" data-testid="workspace-menu">
    <AtsMenu :heading="t('shell.workspaceMenu.heading')">
      <template #trigger="{ props: triggerProps, open }">
        <button
          v-bind="triggerProps"
          type="button"
          class="workspace-menu__trigger"
          :class="{ 'workspace-menu__trigger--open': open }"
          :disabled="switching"
          :aria-busy="switching ? 'true' : undefined"
          :aria-label="t('shell.workspaceMenu.trigger', { name })"
          data-testid="workspace-menu-trigger"
        >
          <span
            class="workspace-menu__tile"
            aria-hidden="true"
            data-testid="workspace-menu-initial"
            >{{ initial }}</span
          >
          <span class="workspace-menu__name" data-testid="workspace-menu-name">{{ name }}</span>
          <AtsIcon class="workspace-menu__chevron" name="chevron-down" :size="14" />
        </button>
      </template>
      <AtsMenuItem
        v-for="workspace in store.workspaces"
        :key="workspace.id"
        class="workspace-menu__item"
        :class="{ 'workspace-menu__item--active': workspace.id === store.activeWorkspaceId }"
        :label="workspace.name"
        :aria-current="workspace.id === store.activeWorkspaceId ? 'true' : undefined"
        :data-testid="`workspace-menu-item-${workspace.id}`"
        @select="onChoose(workspace.id)"
      />
    </AtsMenu>
    <AtsNotice
      v-if="errorText"
      class="workspace-menu__error"
      tone="error"
      data-testid="workspace-menu-error"
    >
      {{ errorText }}
    </AtsNotice>
  </div>
</template>

<style scoped>
/*
 * Trigger from "ATS/App chrome/Desktop": 40 px high, a 1 px line border on the surface, inset 8, a
 * 24 px square ink tile with the initial in the surface colour (so it inverts in dark), the name in
 * bold and the 14 px chevron at the end.
 */
.workspace-menu {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.workspace-menu__trigger {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-sm);
  text-align: left;
  cursor: pointer;
}

.workspace-menu__trigger:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.workspace-menu__trigger:disabled {
  cursor: progress;
  opacity: var(--opacity-disabled);
}

.workspace-menu__tile {
  display: inline-flex;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
}

.workspace-menu__name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.workspace-menu__chevron {
  flex-shrink: 0;
  transition: transform 120ms ease;
}

.workspace-menu__trigger--open .workspace-menu__chevron {
  transform: rotate(180deg);
}

/*
 * Workspace names are medium, like the design; the active one stacks its check above the name. The
 * doubled class outranks AtsMenuItem's own weight whatever order the stylesheets load in.
 */
.workspace-menu__item.workspace-menu__item {
  font-weight: var(--font-weight-medium);
}

.workspace-menu__item--active {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  background: var(--color-accent);
}

/* Decorative: the empty alternative text keeps it out of the accessible name and of typeahead. */
.workspace-menu__item--active::before {
  content: '\2713' / '';
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}
</style>
