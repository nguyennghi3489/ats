<!--
  Navigation list of the mobile top bar (design page "02 · App shell", Example · Mobile navigation
  open): the role's destinations (nav-items.ts) as full-width AtsNavItems, 44 px high below the
  breakpoint, plus "Cài đặt không gian làm việc" for admins, as in the desktop sidebar. It sits in the
  flow right under the top bar, so it pushes the page down rather than covering it.
  Choosing any item (the current one too) emits `close`; the owner (AppTopBar) also closes it on
  Escape and on every route change. Which items show is a UI convenience; the API enforces access
  (decisions §3).
-->
<script setup lang="ts">
import type { WorkspaceRole } from '@ats/shared';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsIcon from '../components/ui/AtsIcon.vue';
import AtsNavItem from '../components/ui/AtsNavItem.vue';
import { navItemsFor, showWorkspaceSettings, WORKSPACE_SETTINGS_ITEM } from './nav-items';

const props = defineProps<{
  /** Id of the <nav>, referenced by the hamburger's aria-controls. */
  id: string;
  /** The user's role in the active workspace; `null` without one. */
  role: WorkspaceRole | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n({ useScope: 'global' });

const items = computed(() => [
  ...navItemsFor(props.role),
  ...(showWorkspaceSettings(props.role) ? [WORKSPACE_SETTINGS_ITEM] : []),
]);
</script>

<template>
  <div class="mobile-nav" data-testid="mobile-nav">
    <nav :id="id" :aria-label="t('shell.nav.label')">
      <ul class="mobile-nav__list" role="list">
        <li v-for="item in items" :key="item.labelKey">
          <AtsNavItem :to="item.to" :label="t(item.labelKey)" @click="emit('close')">
            <template #icon><AtsIcon :name="item.icon" /></template>
          </AtsNavItem>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
/*
 * "Example · Mobile navigation open": items 4 px apart with a 12 px inset on the surface, and an 8 px
 * band of the canvas between the list and the page.
 */
.mobile-nav {
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-block-end: var(--space-2) solid var(--color-canvas);
  background: var(--color-surface);
}

.mobile-nav__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
