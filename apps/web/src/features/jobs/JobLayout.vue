<!--
  The job page at /jobs/:id (design page "02 · App shell", Example · Record · Product Designer): the
  breadcrumb back to the jobs list, the title as the page's only h1, "Mã tham chiếu", the status badge,
  the `actions` slot with "Thao tác tuyển dụng" (JobStatusMenu, only when the user can edit the job;
  a status change swaps in the header it answers, so the badge follows without a reload) and the job
  tabs. This header and its tabs are a
  local layer of the page, separate from the global chrome (AppLayout). The tab's content is the child
  route below it.
  Differences from the design (decisions §5, §16): no "Chưa công khai" badge and no "Đăng tuyển" tab;
  the breadcrumb starts at the jobs list ("Vị trí của tôi" for collaborators), not the workspace name.
  Each tab is a link with its own URL. "Nhóm & quyền truy cập" is for admins and recruiters only (the
  router also sends anyone else back to /jobs/:id).
  A missing job and a hidden one get the same unavailable state (decisions §3).
-->
<script setup lang="ts">
import { JOB_NOT_FOUND, type JobHeader, type JobStatus, type WorkspaceRole } from '@ats/shared';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsBadge, { type BadgeTone } from '../../components/ui/AtsBadge.vue';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsEmptyState from '../../components/ui/AtsEmptyState.vue';
import AtsTab from '../../components/ui/AtsTab.vue';
import AtsTabs, { type TabValue } from '../../components/ui/AtsTabs.vue';
import { ApiError } from '../../lib/api';
import { useWorkspaceStore } from '../workspaces/workspace.store';
import JobStatusMenu from './JobStatusMenu.vue';
import { getJob } from './jobs.api';

defineSlots<{
  /** "Thao tác tuyển dụng": by default the job's status actions (JobStatusMenu). */
  actions?: () => unknown;
}>();

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const workspaces = useWorkspaceStore();

if (workspaces.status === 'idle') void workspaces.load();

const role = computed<WorkspaceRole | null>(
  () =>
    workspaces.workspaces.find((workspace) => workspace.id === workspaces.activeWorkspaceId)
      ?.role ?? null,
);

interface JobTab {
  /** Name of the child route. */
  name: string;
  labelKey: string;
  roles?: readonly WorkspaceRole[];
}

const TABS: readonly JobTab[] = [
  { name: 'job-applications', labelKey: 'jobs.tabs.applications' },
  { name: 'job-plan', labelKey: 'jobs.tabs.plan' },
  { name: 'job-content', labelKey: 'jobs.tabs.content' },
  { name: 'job-stages', labelKey: 'jobs.tabs.stages' },
  { name: 'job-team', labelKey: 'jobs.tabs.team', roles: ['admin', 'recruiter'] },
];

const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  paused: 'accent',
  closed: 'neutral',
};

const PANEL_ID = 'job-tab-panel';

const jobId = computed(() => String(route.params.id ?? ''));

const visibleTabs = computed(() =>
  TABS.filter((tab) => !tab.roles || (role.value !== null && tab.roles.includes(role.value))).map(
    (tab) => ({
      ...tab,
      href: router.resolve({ name: tab.name, params: { id: jobId.value } }).href,
    }),
  ),
);

const currentTab = computed<TabValue | undefined>({
  get: () => (typeof route.name === 'string' ? route.name : undefined),
  set: (name) => {
    if (typeof name !== 'string' || name === route.name) return;
    void router.push({ name, params: { id: jobId.value } });
  },
});

const listLabel = computed(() =>
  role.value === 'collaborator' ? t('shell.nav.myJobs') : t('shell.nav.jobs'),
);

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; job: JobHeader }
  | { kind: 'not-found' }
  | { kind: 'error'; error: unknown };

const state = ref<State>({ kind: 'loading' });
let latest = 0;

async function load(id: string) {
  const request = ++latest;
  state.value = { kind: 'loading' };
  try {
    const job = await getJob(id);
    if (request === latest) state.value = { kind: 'ready', job };
  } catch (error) {
    if (request !== latest) return;
    state.value =
      error instanceof ApiError && error.code === JOB_NOT_FOUND
        ? { kind: 'not-found' }
        : { kind: 'error', error };
  }
}

watch(jobId, (id) => void load(id), { immediate: true });

function onStatusChanged(job: JobHeader) {
  if (state.value.kind === 'ready' && state.value.job.id === job.id) {
    state.value = { kind: 'ready', job };
  }
}

const errorText = computed(() => {
  if (state.value.kind !== 'error') return '';
  const { error } = state.value;
  return error instanceof ApiError ? error.translate() : t('errors.unknown');
});
</script>

<template>
  <div class="job-layout" data-testid="job-page">
    <div
      v-if="state.kind === 'loading'"
      class="job-layout__skeleton"
      role="status"
      aria-busy="true"
      :aria-label="t('jobs.header.loading')"
      data-testid="job-loading"
    >
      <span class="job-layout__bone job-layout__bone--crumb"></span>
      <span class="job-layout__bone job-layout__bone--title"></span>
      <span class="job-layout__bone job-layout__bone--code"></span>
      <span class="job-layout__bone job-layout__bone--badge"></span>
      <span class="job-layout__bone job-layout__bone--tabs"></span>
    </div>

    <div
      v-else-if="state.kind === 'not-found'"
      class="job-layout__state"
      data-testid="job-unavailable"
    >
      <AtsEmptyState :title="t('jobs.header.notFound')" :heading-level="1">
        <template #action>
          <RouterLink class="job-layout__back" to="/jobs">{{
            t('jobs.header.backToList')
          }}</RouterLink>
        </template>
      </AtsEmptyState>
    </div>

    <div v-else-if="state.kind === 'error'" class="job-layout__state" data-testid="job-error">
      <AtsEmptyState :title="errorText" :heading-level="1">
        <template #action>
          <AtsButton variant="outline" @click="load(jobId)">{{ t('jobs.header.retry') }}</AtsButton>
        </template>
      </AtsEmptyState>
    </div>

    <template v-else>
      <header class="job-layout__header" data-testid="job-header">
        <nav
          class="job-layout__breadcrumb"
          :aria-label="t('jobs.header.breadcrumb')"
          data-testid="job-breadcrumb"
        >
          <ol class="job-layout__crumbs">
            <li class="job-layout__crumb">
              <RouterLink class="job-layout__crumb-link" to="/jobs">{{ listLabel }}</RouterLink>
              <span class="job-layout__crumb-separator" aria-hidden="true">/</span>
            </li>
            <li class="job-layout__crumb" aria-current="page">{{ state.job.title }}</li>
          </ol>
        </nav>

        <div class="job-layout__row">
          <div class="job-layout__heading">
            <h1 class="job-layout__title">{{ state.job.title }}</h1>
            <p class="job-layout__code" data-testid="job-code">
              {{ t('jobs.header.code', { code: state.job.code }) }}
            </p>
            <div class="job-layout__badges">
              <AtsBadge :tone="STATUS_TONES[state.job.status]" data-testid="job-status">{{
                t(`jobs.status.${state.job.status}`)
              }}</AtsBadge>
            </div>
          </div>
          <div v-if="$slots.actions || state.job.canEdit" class="job-layout__actions">
            <slot name="actions">
              <JobStatusMenu :job="state.job" @changed="onStatusChanged" @reload="load(jobId)" />
            </slot>
          </div>
        </div>

        <AtsTabs
          v-model="currentTab"
          class="job-layout__tabs"
          :label="t('jobs.tabs.label')"
          data-testid="job-tabs"
        >
          <AtsTab
            v-for="tab in visibleTabs"
            :id="`${tab.name}-tab`"
            :key="tab.name"
            :value="tab.name"
            :label="t(tab.labelKey)"
            :href="tab.href"
            :aria-controls="PANEL_ID"
          />
        </AtsTabs>
      </header>

      <div
        :id="PANEL_ID"
        class="job-layout__panel"
        role="tabpanel"
        :aria-labelledby="typeof currentTab === 'string' ? `${currentTab}-tab` : undefined"
      >
        <RouterView />
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * Desktop: inset 24 top and 32 sides as in the design, breadcrumb 16 px above the title, the code
 * and badges under it, then the tabs on the 1 px line that closes the header edge to edge.
 * Below 768 px: 20 px sides, the smaller title, and the tab row scrolls sideways under the edges.
 */
.job-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--color-ink);
}

.job-layout__header {
  box-sizing: border-box;
  min-width: 0;
  padding: var(--space-6) var(--space-8) 0;
  border-bottom: 1px solid var(--color-line);
}

.job-layout__breadcrumb {
  margin-bottom: var(--space-4);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.job-layout__crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.job-layout__crumb {
  display: inline-flex;
  gap: var(--space-1);
  min-width: 0;
  overflow-wrap: anywhere;
}

.job-layout__crumb-link {
  color: inherit;
  text-decoration: none;
}

.job-layout__crumb-link:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

.job-layout__crumb-link:focus-visible,
.job-layout__back:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.job-layout__row {
  display: flex;
  gap: var(--space-6);
  align-items: center;
  justify-content: space-between;
}

.job-layout__heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
  min-width: 0;
}

.job-layout__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xl);
  overflow-wrap: anywhere;
}

.job-layout__code {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.job-layout__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 100%;
}

.job-layout__actions {
  display: flex;
  flex: none;
  gap: var(--space-2);
  align-items: center;
}

/*
 * The record's tab row: one-line labels about 28 px apart, the first label lined up with the title
 * (the tab's 12 px inset pulled back), instead of the generic row's 72 px wrapping label boxes. A
 * row wider than the header scrolls sideways; the block padding keeps the focus ring unclipped.
 */
.job-layout__tabs {
  flex-wrap: nowrap;
  gap: var(--space-1);
  margin-top: var(--space-2);
  margin-inline-start: calc(-1 * var(--space-3));
  padding-block: var(--focus-ring-width) 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.job-layout__tabs :deep(.ats-tab) {
  flex: none;
}

.job-layout__tabs :deep(.ats-tab__label) {
  width: auto;
  white-space: nowrap;
}

.job-layout__panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.job-layout__state {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  padding: var(--space-8) var(--space-4);
}

.job-layout__back {
  color: var(--color-ink);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-sm);
}

.job-layout__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-6) var(--space-8) var(--space-4);
  border-bottom: 1px solid var(--color-line);
}

.job-layout__bone {
  display: block;
  max-width: 100%;
  border-radius: var(--radius-sm);
  background: var(--color-line);
}

.job-layout__bone--crumb {
  width: 200px;
  height: 16px;
}

.job-layout__bone--title {
  width: 320px;
  height: 36px;
}

.job-layout__bone--code {
  width: 140px;
  height: 16px;
}

.job-layout__bone--badge {
  width: 96px;
  height: 28px;
  border-radius: var(--radius-full);
}

.job-layout__bone--tabs {
  width: 480px;
  height: 36px;
  margin-top: var(--space-2);
}

@media (max-width: 767px) {
  .job-layout__header {
    padding: var(--space-6) 20px 0;
  }

  .job-layout__skeleton {
    padding: var(--space-6) 20px var(--space-4);
  }

  .job-layout__row {
    flex-direction: column;
    gap: var(--space-3);
    align-items: stretch;
  }

  .job-layout__title {
    font-size: var(--font-size-lg);
    line-height: var(--line-height-lg);
  }

  .job-layout__actions {
    flex-direction: column;
    align-items: stretch;
  }

  /* The scrolling row runs under the header's edges; the page never scrolls horizontally. */
  .job-layout__tabs {
    margin-inline: -20px;
    padding-inline: calc(20px - var(--space-3));
  }
}
</style>
