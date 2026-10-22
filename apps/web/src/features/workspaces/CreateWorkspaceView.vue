<!--
  Create a workspace (design WS-01 first workspace, WS-02 creating, WS-03 could not confirm, WS-05 new
  workspace while already a member elsewhere, WS-07 mobile) at `/workspaces/new`, signed-in only.
  The name goes to `POST /api/workspaces` with an `Idempotency-Key` made when the page opens and kept
  for every retry of the same name, so "Thử lại" after a lost answer never creates a second workspace
  (decisions §4, §5). A new name gets a new key. On success the user lands on `/`.
  WS-05 (opened with `?from=chooser`, or the user already has workspaces) swaps the invite notice and
  "Đăng xuất" for "Hủy · Quay lại danh sách" to `/workspaces`.
  Differs from the design: none intended. The job-code prefix (fixed at creation) is not shown, as in
  the design.
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { WORKSPACE_NAME_MAX_LENGTH, workspaceNameSchema } from '@ats/shared';
import { computed, nextTick, onMounted, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import AuthLayout from '../auth/AuthLayout.vue';
import { useSessionStore } from '../auth/session.store';
import { workspacesApi } from './workspaces.api';

/** `form` is WS-01 / WS-05, `pending` WS-02, `failed` WS-03. */
type Phase = 'form' | 'pending' | 'failed';
type NameError = 'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'VALIDATION_FAILED';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const nameId = useId();
const name = ref('');
const phase = ref<Phase>('form');
/** Set by the first submit; from then on the name is re-checked as the user types. */
const submitted = ref(false);
/** The name the API refused as invalid; the field error lasts until the name changes. */
const refusedName = ref<string | null>(null);
/** Code of a refusal shown in the error notice (not a lost answer: that is WS-03). */
const requestError = ref<string | null>(null);

// One key per creation attempt: made when the page opens, kept while the name stays the same.
let idempotencyKey = globalThis.crypto.randomUUID();
let keyName: string | null = null;

const fromChooser = computed(() => route.query.from === 'chooser');
const listHasWorkspaces = ref(false);
/** WS-05: the user can go back to their other workspaces instead. */
const hasWorkspaces = computed(() => fromChooser.value || listHasWorkspaces.value);

onMounted(async () => {
  if (fromChooser.value) return;
  try {
    listHasWorkspaces.value = (await workspacesApi.list()).length > 0;
  } catch {
    // Without the list the page stays the first-workspace version; the chooser link is a shortcut.
  }
});

const localNameError = computed<NameError | undefined>(() => {
  if (!submitted.value) return undefined;
  const result = workspaceNameSchema.safeParse(name.value);
  if (result.success) return undefined;
  return name.value.trim() === '' ? 'NAME_REQUIRED' : 'NAME_TOO_LONG';
});

const nameError = computed(() => {
  const code =
    localNameError.value ??
    (refusedName.value !== null && refusedName.value === name.value.trim()
      ? 'VALIDATION_FAILED'
      : undefined);
  return code
    ? t(`workspaces.create.errors.${code}`, { max: WORKSPACE_NAME_MAX_LENGTH })
    : undefined;
});

const title = computed(() => {
  if (phase.value === 'pending') return t('workspaces.create.pendingTitle');
  if (phase.value === 'failed') return t('workspaces.create.failedTitle');
  return hasWorkspaces.value ? t('workspaces.create.newTitle') : t('workspaces.create.title');
});

const subtitle = computed(() => {
  if (phase.value === 'pending') return t('workspaces.create.pendingSubtitle');
  if (phase.value === 'failed') return t('workspaces.create.failedSubtitle');
  return hasWorkspaces.value ? t('workspaces.create.newSubtitle') : t('workspaces.create.subtitle');
});

const submitLabel = computed(() => {
  if (phase.value === 'pending') return t('workspaces.create.pendingButton');
  if (phase.value === 'failed') return t('workspaces.create.retry');
  return t('workspaces.create.submit');
});

const requestErrorText = computed(() =>
  requestError.value ? translateError(requestError.value) : null,
);

/** No answer, a server failure or an unreadable success: the workspace may or may not exist. */
function isUnconfirmed(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status >= 500 || error.status < 400;
}

async function onSubmit() {
  if (phase.value === 'pending') return;
  submitted.value = true;
  requestError.value = null;
  if (localNameError.value) {
    phase.value = 'form';
    await nextTick();
    document.getElementById(nameId)?.focus();
    return;
  }

  const trimmed = name.value.trim();
  if (keyName !== null && keyName !== trimmed) idempotencyKey = globalThis.crypto.randomUUID();
  keyName = trimmed;

  phase.value = 'pending';
  try {
    await workspacesApi.create(trimmed, idempotencyKey);
  } catch (error) {
    if (isUnconfirmed(error)) {
      phase.value = 'failed';
      return;
    }
    phase.value = 'form';
    const code = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    if (code === 'VALIDATION_FAILED') {
      refusedName.value = trimmed;
      await nextTick();
      document.getElementById(nameId)?.focus();
    } else {
      requestError.value = code;
    }
    return;
  }
  await router.push('/');
}

/** WS-03 "Quay lại": back to the form, name kept. */
function backToForm() {
  phase.value = 'form';
}

function backToList() {
  void router.push('/workspaces');
}

const signingOut = ref(false);

async function onSignOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  requestError.value = null;
  try {
    await session.signOut();
  } catch (error) {
    requestError.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    return;
  } finally {
    signingOut.value = false;
  }
  await router.push('/sign-in');
}
</script>

<template>
  <AuthLayout
    :title="title"
    :subtitle="subtitle"
    class="create-workspace-layout"
    :class="`create-workspace-layout--${phase}`"
  >
    <form
      class="create-workspace"
      novalidate
      data-testid="create-workspace-form"
      @submit.prevent="onSubmit"
    >
      <AtsNotice v-if="phase === 'failed'" tone="error" data-testid="create-workspace-failed">
        {{ t('workspaces.create.failedNotice') }}
      </AtsNotice>

      <AtsTextField
        :id="nameId"
        v-model="name"
        :label="t('workspaces.create.name')"
        :error="nameError"
        :disabled="phase === 'pending'"
        autocomplete="organization"
        data-testid="create-workspace-name"
      />

      <AtsButton
        type="submit"
        block
        :disabled="phase === 'pending'"
        class="create-workspace__submit"
        data-testid="create-workspace-submit"
      >
        {{ submitLabel }}
      </AtsButton>

      <AtsNotice v-if="phase === 'pending'" data-testid="create-workspace-pending-notice">
        {{ t('workspaces.create.pendingNotice') }}
      </AtsNotice>

      <AtsButton
        v-if="phase === 'failed'"
        variant="outline"
        block
        data-testid="create-workspace-back"
        @click="backToForm"
      >
        {{ t('workspaces.create.back') }}
      </AtsButton>

      <template v-if="phase === 'form'">
        <AtsButton
          v-if="hasWorkspaces"
          variant="outline"
          block
          data-testid="create-workspace-back-to-list"
          @click="backToList"
        >
          {{ t('workspaces.create.backToList') }}
        </AtsButton>
        <template v-else>
          <!-- WS-01 shows the notice; WS-07 (mobile) a shorter plain line instead. -->
          <AtsNotice class="create-workspace__invite" data-testid="create-workspace-invite-notice">
            {{ t('workspaces.create.inviteOnly') }}
          </AtsNotice>
          <p class="create-workspace__invite-short" data-testid="create-workspace-invite-short">
            {{ t('workspaces.create.inviteOnlyShort') }}
          </p>
        </template>
      </template>

      <AtsNotice v-if="requestErrorText" tone="error" data-testid="create-workspace-error">
        {{ requestErrorText }}
      </AtsNotice>
    </form>

    <template v-if="phase === 'form' && !hasWorkspaces" #footer>
      <button
        type="button"
        class="create-workspace__sign-out"
        :aria-busy="signingOut ? 'true' : undefined"
        data-testid="create-workspace-sign-out"
        @click="onSignOut"
      >
        {{ t('workspaces.create.signOut') }}
      </button>
    </template>
  </AuthLayout>
</template>

<style scoped>
.create-workspace {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* WS-01 / WS-05 leave a wider gap above the primary button than the pending and failed states. */
.create-workspace-layout--form .create-workspace__submit {
  margin-top: var(--space-4);
}

.create-workspace__invite-short {
  display: none;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

/* "Đăng xuất" in the muted footer text on desktop, like the other auth pages' footer links. */
.create-workspace__sign-out {
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.create-workspace__sign-out:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

.create-workspace__sign-out:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/*
 * Mobile (WS-07): no subtitle on the form, the invite line as plain muted text instead of a notice,
 * and "Đăng xuất" as a full-width outline button.
 */
@media (max-width: 767px) {
  .create-workspace-layout--form :deep(.auth-layout__subtitle) {
    display: none;
  }

  .create-workspace-layout--form .create-workspace__submit {
    margin-top: 0;
  }

  .create-workspace__invite {
    display: none;
  }

  .create-workspace__invite-short {
    display: block;
  }

  .create-workspace__sign-out {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-1) var(--space-4);
    border: 1px solid var(--color-line);
    background: var(--color-control);
    color: var(--color-ink);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: var(--line-height-sm);
  }

  .create-workspace__sign-out:hover {
    background: var(--color-accent);
    text-decoration: none;
  }
}
</style>
