<!--
  Desktop sidebar of the app shell (design page "02 · App shell", ATS/App chrome/Desktop): the
  `workspace` slot on top, the role's destinations (nav-items.ts), a spacer, "Cài đặt không gian làm
  việc" pinned near the bottom for admins, a divider and the user row (initials, name, translated role)
  with the `account` slot (the "..." trigger).
  Differs from the design: the ATS icon set has no briefcase, so the archive box stands in for it and
  Ứng viên uses the person icon; the avatar shows the user's initials instead of an empty circle.
  Which items show is a UI convenience; the API enforces access (decisions §3).
-->
<script setup lang="ts">
import type { WorkspaceRole } from '@ats/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsIcon from '../components/ui/AtsIcon.vue';
import AtsNavItem from '../components/ui/AtsNavItem.vue';
import { navItemsFor, showWorkspaceSettings, WORKSPACE_SETTINGS_ITEM } from './nav-items';

const props = defineProps<{
  /** The user's role in the active workspace; `null` without one. */
  role: WorkspaceRole | null;
  userName: string;
}>();

defineSlots<{
  /** The workspace menu trigger, on top of the sidebar. */
  workspace?: () => unknown;
  /** The account menu trigger, next to the user's name. */
  account?: () => unknown;
}>();

const { t } = useI18n({ useScope: 'global' });

const items = computed(() => navItemsFor(props.role));
const settings = computed(() => showWorkspaceSettings(props.role));

/** First letters of the first and last words, e.g. "Nguyễn Văn An" → "NA". */
const initials = computed(() => {
  const words = props.userName.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .filter((word): word is string => word !== undefined)
    .map((word) => [...word][0]?.toLocaleUpperCase() ?? '')
    .join('');
});
</script>

<template>
  <aside class="app-sidebar" data-testid="app-sidebar">
    <div v-if="$slots.workspace" class="app-sidebar__workspace">
      <slot name="workspace" />
    </div>

    <nav class="app-sidebar__nav" :aria-label="t('shell.nav.label')">
      <ul class="app-sidebar__list" role="list">
        <li v-for="item in items" :key="item.labelKey">
          <AtsNavItem :to="item.to" :label="t(item.labelKey)">
            <template #icon><AtsIcon :name="item.icon" /></template>
          </AtsNavItem>
        </li>
      </ul>
      <div v-if="settings" class="app-sidebar__settings">
        <AtsNavItem :to="WORKSPACE_SETTINGS_ITEM.to" :label="t(WORKSPACE_SETTINGS_ITEM.labelKey)">
          <template #icon><AtsIcon :name="WORKSPACE_SETTINGS_ITEM.icon" /></template>
        </AtsNavItem>
      </div>
    </nav>

    <div class="app-sidebar__user" data-testid="app-sidebar-user">
      <span class="app-sidebar__avatar" aria-hidden="true" data-testid="app-sidebar-avatar">{{
        initials
      }}</span>
      <span class="app-sidebar__who">
        <span class="app-sidebar__name" data-testid="app-sidebar-user-name">{{ userName }}</span>
        <span v-if="role" class="app-sidebar__role" data-testid="app-sidebar-user-role">{{
          t(`shell.roles.${role}`)
        }}</span>
      </span>
      <span v-if="$slots.account" class="app-sidebar__account">
        <slot name="account" />
      </span>
    </div>
  </aside>
</template>

<style scoped>
/*
 * 224 px wide with a 16 px inset; the workspace control 40 px high and 20 px above the list; items
 * 4 px apart; settings pinned above a divider; the user row 16 px under it. Light: the sidebar is the
 * same lilac as an item at rest. Dark: the sidebar sits on the canvas so items read as raised tiles.
 */
.app-sidebar {
  display: flex;
  flex-direction: column;
  width: 224px;
  height: 100%;
  min-height: 0;
  padding: var(--space-6) var(--space-4) var(--space-4);
  border-inline-end: 1px solid var(--color-line);
  background: var(--color-sidebar);
  color: var(--color-ink);
  overflow-y: auto;
}

[data-theme='dark'] .app-sidebar {
  background: var(--color-canvas);
}

.app-sidebar__workspace {
  margin-block-end: 20px;
}

.app-sidebar__nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 0;
}

.app-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-sidebar__settings {
  margin-block-start: auto;
  padding-block-start: var(--space-4);
}

.app-sidebar__user {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-block-start: 20px;
  padding-block-start: var(--space-4);
  border-block-start: 1px solid var(--color-line);
}

.app-sidebar__avatar {
  display: inline-flex;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
}

.app-sidebar__who {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.app-sidebar__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-sm);
  overflow-wrap: anywhere;
}

.app-sidebar__role {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.app-sidebar__account {
  display: inline-flex;
  flex-shrink: 0;
}
</style>
