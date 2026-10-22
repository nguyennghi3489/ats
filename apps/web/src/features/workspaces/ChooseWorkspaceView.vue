<!--
  Choose a workspace (design WS-04) at `/workspaces`, signed-in only: one row per workspace the user
  is an active member of, "Tạo không gian mới" to `/workspaces/new?from=chooser` and "Đăng xuất".
  Picking a row disables the list, switches the session's active workspace (`PUT
  /api/workspaces/active`) and goes to `/`, or to the `redirect` query when it is a safe path.
  A workspace that is no longer available (`WORKSPACE_UNAVAILABLE`, decisions §3) reloads the list and
  says so in an error notice.
  Differs from the design: none intended. Rows show only the workspace name (no role badge).
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import AuthLayout from '../auth/AuthLayout.vue';
import { safeRedirect } from '../auth/redirect';
import { useSessionStore } from '../auth/session.store';
import { useWorkspaceStore } from './workspace.store';
import WorkspaceRow from './WorkspaceRow.vue';

const WORKSPACE_UNAVAILABLE = 'WORKSPACE_UNAVAILABLE';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const store = useWorkspaceStore();

/** A switch is running: every row is disabled until it settles. */
const selecting = ref(false);
/** Code of the last failed switch or sign-out, shown in the error notice. */
const actionError = ref<string | null>(null);
const signingOut = ref(false);

onMounted(() => {
  void store.load();
});

const loading = computed(() => store.status === 'loading' || store.status === 'idle');

const errorText = computed(() => {
  if (actionError.value === WORKSPACE_UNAVAILABLE) return t('workspaces.choose.unavailable');
  if (actionError.value) return translateError(actionError.value);
  if (store.status === 'error' && store.errorCode) return translateError(store.errorCode);
  return null;
});

function codeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
}

async function onSelect(id: string) {
  if (selecting.value || signingOut.value) return;
  selecting.value = true;
  actionError.value = null;
  try {
    await store.select(id);
  } catch (error) {
    const code = codeOf(error);
    if (code === WORKSPACE_UNAVAILABLE) await store.load();
    actionError.value = code;
    selecting.value = false;
    return;
  }
  await router.push(safeRedirect(route.query.redirect));
}

function onRetry() {
  actionError.value = null;
  void store.load();
}

function onCreate() {
  void router.push({ path: '/workspaces/new', query: { from: 'chooser' } });
}

async function onSignOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  actionError.value = null;
  try {
    await session.signOut();
  } catch (error) {
    actionError.value = codeOf(error);
    return;
  } finally {
    signingOut.value = false;
  }
  store.reset();
  await router.push('/sign-in');
}
</script>

<template>
  <AuthLayout :title="t('workspaces.choose.title')" :subtitle="t('workspaces.choose.subtitle')">
    <div class="choose-workspace">
      <AtsNotice v-if="errorText" tone="error" data-testid="choose-workspace-error">
        {{ errorText }}
      </AtsNotice>

      <p v-if="loading" class="choose-workspace__loading" data-testid="choose-workspace-loading">
        {{ t('workspaces.choose.loading') }}
      </p>

      <ul
        v-else-if="store.workspaces.length > 0"
        class="choose-workspace__list"
        :aria-label="t('workspaces.choose.listLabel')"
        :aria-busy="selecting ? 'true' : undefined"
        data-testid="choose-workspace-list"
      >
        <li v-for="workspace in store.workspaces" :key="workspace.id">
          <WorkspaceRow
            :name="workspace.name"
            :disabled="selecting"
            data-testid="workspace-row"
            @select="onSelect(workspace.id)"
          />
        </li>
      </ul>

      <AtsButton
        v-if="store.status === 'error'"
        variant="outline"
        block
        data-testid="choose-workspace-retry"
        @click="onRetry"
      >
        {{ t('workspaces.choose.retry') }}
      </AtsButton>

      <AtsButton
        variant="outline"
        block
        :disabled="selecting"
        data-testid="choose-workspace-create"
        @click="onCreate"
      >
        {{ t('workspaces.choose.create') }}
      </AtsButton>
    </div>

    <template #footer>
      <button
        type="button"
        class="choose-workspace__sign-out"
        :aria-busy="signingOut ? 'true' : undefined"
        data-testid="choose-workspace-sign-out"
        @click="onSignOut"
      >
        {{ t('workspaces.choose.signOut') }}
      </button>
    </template>
  </AuthLayout>
</template>

<style scoped>
/* WS-04: rows 8 px apart, 14 px above "Tạo không gian mới". */
.choose-workspace {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.choose-workspace__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.choose-workspace__loading {
  margin: 0;
  color: var(--color-muted);
}

/* "Đăng xuất" in the muted footer text, like the other auth pages' footer links. */
.choose-workspace__sign-out {
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.choose-workspace__sign-out:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

.choose-workspace__sign-out:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
