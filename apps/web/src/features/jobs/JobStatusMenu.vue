<!--
  "Thao tác tuyển dụng" in the job page header (design page "02 · App shell", Example · Record): an
  outline button opening an AtsMenu with the lifecycle moves of the job's status (decisions §5):
  Draft → "Mở tuyển"; Open → "Tạm dừng", "Đóng vị trí"; Paused → "Tiếp tục tuyển", "Đóng vị trí";
  Closed → "Mở lại". The job page renders it only when the caller may edit the job; the API enforces
  that again on every change (decisions §3).
  No design screen exists for the items or the close confirmation; they follow the AtsMenu and
  AtsDialog foundation specimens. "Đóng vị trí" asks first in an AtsDialog, with focus on "Hủy";
  Escape cancels. Every change sends the `version` the page loaded; on success it emits `changed`
  with the new header (the page swaps it in, so the badge follows without a reload). A refusal shows
  its translated code as an error notice under the button; `JOB_VERSION_STALE` adds "Tải lại", which
  emits `reload`.
-->
<script setup lang="ts">
import { allowedTransitions, JOB_VERSION_STALE, type JobHeader, type JobStatus } from '@ats/shared';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsDialog from '../../components/ui/AtsDialog.vue';
import AtsMenu from '../../components/ui/AtsMenu.vue';
import AtsMenuItem from '../../components/ui/AtsMenuItem.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { changeJobStatus } from './jobs.api';

const props = defineProps<{ job: JobHeader }>();

const emit = defineEmits<{
  /** The status changed: the job's new header, with its new `version`. */
  changed: [job: JobHeader];
  /** "Tải lại" after a stale version: the page loads the job again. */
  reload: [];
}>();

const { t } = useI18n({ useScope: 'global' });

/** The menu label of moving a job from `from` to `to`. */
function labelKey(from: JobStatus, to: JobStatus): string {
  if (to === 'paused') return 'jobs.status.actions.pause';
  if (to === 'closed') return 'jobs.status.actions.close';
  if (from === 'draft') return 'jobs.status.actions.open';
  if (from === 'paused') return 'jobs.status.actions.resume';
  return 'jobs.status.actions.reopen';
}

const actions = computed(() =>
  allowedTransitions(props.job.status).map((to) => ({
    to,
    label: t(labelKey(props.job.status, to)),
  })),
);

const pending = ref(false);
const confirmingClose = ref(false);
/** Code of the last refused change, shown in the error notice. */
const errorCode = ref<string | null>(null);

const errorText = computed(() => (errorCode.value ? translateError(errorCode.value) : null));

async function change(to: JobStatus) {
  if (pending.value) return;
  pending.value = true;
  errorCode.value = null;
  try {
    const job = await changeJobStatus(props.job.id, { to, version: props.job.version });
    emit('changed', job);
  } catch (error) {
    errorCode.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
  } finally {
    pending.value = false;
    confirmingClose.value = false;
  }
}

function onSelect(to: JobStatus) {
  if (to === 'closed') {
    errorCode.value = null;
    confirmingClose.value = true;
    return;
  }
  void change(to);
}
</script>

<template>
  <div class="job-status-menu" data-testid="job-status-menu">
    <AtsMenu placement="bottom-end">
      <template #trigger="{ props: triggerProps }">
        <AtsButton
          v-bind="triggerProps"
          variant="outline"
          :pending="pending"
          data-testid="job-status-trigger"
          >{{ t('jobs.status.actions.trigger') }}</AtsButton
        >
      </template>
      <AtsMenuItem
        v-for="action in actions"
        :key="action.to"
        :label="action.label"
        :data-testid="`job-status-action-${action.to}`"
        @select="onSelect(action.to)"
      />
    </AtsMenu>

    <AtsNotice
      v-if="errorText"
      class="job-status-menu__error"
      tone="error"
      data-testid="job-status-error"
    >
      <span>{{ errorText }}</span>
      <AtsButton
        v-if="errorCode === JOB_VERSION_STALE"
        class="job-status-menu__reload"
        variant="outline"
        data-testid="job-status-reload"
        @click="emit('reload')"
        >{{ t('jobs.status.actions.reload') }}</AtsButton
      >
    </AtsNotice>

    <AtsDialog
      v-model:open="confirmingClose"
      :title="t('jobs.status.actions.closeConfirm.title')"
      :close-label="t('common.close')"
      :pending="pending"
      data-testid="job-close-dialog"
    >
      <p>{{ t('jobs.status.actions.closeConfirm.body') }}</p>
      <template #footer>
        <AtsButton
          variant="outline"
          :disabled="pending"
          data-testid="job-close-cancel"
          @click="confirmingClose = false"
          >{{ t('common.cancel') }}</AtsButton
        >
        <AtsButton :pending="pending" data-testid="job-close-confirm" @click="change('closed')">{{
          t('jobs.status.actions.closeConfirm.confirm')
        }}</AtsButton>
      </template>
    </AtsDialog>
  </div>
</template>

<style scoped>
/* The button sits at the end of the header row; a notice opens under it, no wider than 360 px. */
.job-status-menu {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
}

.job-status-menu__error {
  max-width: 360px;
}

.job-status-menu__reload {
  margin-top: var(--space-2);
}

@media (max-width: 767px) {
  .job-status-menu {
    align-items: stretch;
  }

  .job-status-menu__error {
    max-width: none;
  }
}
</style>
