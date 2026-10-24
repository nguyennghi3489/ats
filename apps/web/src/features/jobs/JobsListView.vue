<!--
  The jobs list at /jobs (design page "02 · App shell": Example · Desktop list, Example · Empty
  workspace, Example · Collaborator view, Example · Dark desktop). The page header with "Tạo vị trí",
  the search and status toolbar, then the table of the jobs the user can see (decisions §3: the API
  filters them; a collaborator gets "Vị trí của tôi" with only their assigned jobs), 25 per page
  (decisions §11). Search, status and page live in the URL query, so back/forward and reload keep them.
  Differences from the design:
  - no "Tạo vị trí" for collaborators, who cannot create jobs (decisions §3);
  - the status filter's "Tất cả" is every status except Closed, and "Đã đóng" is its own option
    (decisions §5); the closed select is drawn "Trạng thái: Tất cả" as designed, while "Trạng thái"
    stays its accessible label and the options keep their bare names;
  - no "Địa điểm" filter yet (a separate issue);
  - the subtitle says "trạng thái tuyển dụng": publishing is out of v1 (decisions §16);
  - the status is an AtsBadge, not coloured text, so it never relies on colour alone;
  - the empty workspace keeps "Tạo vị trí" in the header, so its one "Tạo vị trí đầu tiên" is the
    empty state's.
  An empty default list is only an "empty workspace" when there is no Closed job either; otherwise
  the toolbar stays so the Closed jobs remain reachable.
  "Tạo vị trí" emits `create` and opens the `create` slot, which the create dialog issue fills.
-->
<script setup lang="ts">
/* global setTimeout, clearTimeout -- timer globals, which no-undef does not know in .vue files */
import {
  JOB_LIST_QUERY_MAX_LENGTH,
  type JobListResponse,
  type JobListStatus,
  jobListStatusSchema,
  type JobStatus,
  type JobSummary,
  type WorkspaceRole,
} from '@ats/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { type LocationQuery, type LocationQueryRaw, useRoute, useRouter } from 'vue-router';
import AtsPageBody from '../../components/layout/AtsPageBody.vue';
import AtsPageHeader from '../../components/layout/AtsPageHeader.vue';
import AtsBadge, { type BadgeTone } from '../../components/ui/AtsBadge.vue';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsEmptyState from '../../components/ui/AtsEmptyState.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsSelect, { type AtsSelectOption } from '../../components/ui/AtsSelect.vue';
import AtsTable, { type TableColumn } from '../../components/ui/AtsTable.vue';
import AtsTableCell from '../../components/ui/AtsTableCell.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { ApiError } from '../../lib/api';
import { useWorkspaceStore } from '../workspaces/workspace.store';
import { listJobs } from './jobs.api';

const emit = defineEmits<{
  /** "Tạo vị trí" or "Tạo vị trí đầu tiên" was chosen. */
  create: [];
}>();

defineSlots<{
  /** The create flow (the create dialog issue fills it), told whether it is open. */
  create?: (props: { open: boolean; close: () => void }) => unknown;
}>();

/** Milliseconds between the last keystroke and the search (decisions §11). */
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  paused: 'accent',
  closed: 'neutral',
};

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
const isCollaborator = computed(() => role.value === 'collaborator');
/** Admins and recruiters create jobs (decisions §3); the API refuses anyone else anyway. */
const canCreate = computed(() => role.value === 'admin' || role.value === 'recruiter');

interface ListFilter {
  q: string;
  status: JobListStatus;
  page: number;
}

function firstValue(query: LocationQuery, key: string): string | undefined {
  const raw = query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : undefined;
}

/** The list's filter from the URL query; an unknown status or page falls back to the default. */
function readFilter(query: LocationQuery): ListFilter {
  const q = (firstValue(query, 'q') ?? '').trim().slice(0, JOB_LIST_QUERY_MAX_LENGTH);
  const status = jobListStatusSchema.safeParse(firstValue(query, 'status'));
  const page = firstValue(query, 'page') ?? '';
  return {
    q,
    status: status.success ? status.data : 'active',
    page: /^[1-9]\d{0,8}$/.test(page) ? Number(page) : 1,
  };
}

/** The URL query of `filter`, without its defaults, so the default list is plain `/jobs`. */
function toQuery({ q, status, page }: ListFilter): LocationQueryRaw {
  const query: LocationQueryRaw = {};
  if (q) query.q = q;
  if (status !== 'active') query.status = status;
  if (page > 1) query.page = String(page);
  return query;
}

const filter = computed(() => readFilter(route.query));
const isDefaultFilter = computed(() => filter.value.q === '' && filter.value.status === 'active');

// --- search -------------------------------------------------------------------------------------

const searchText = ref(filter.value.q);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function cancelSearch() {
  if (searchTimer !== undefined) clearTimeout(searchTimer);
  searchTimer = undefined;
}

function navigate(next: ListFilter, replace = false) {
  const location = { query: toQuery(next) };
  void (replace ? router.replace(location) : router.push(location));
}

watch(searchText, (text) => {
  cancelSearch();
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    const q = text.trim().slice(0, JOB_LIST_QUERY_MAX_LENGTH);
    // Typing replaces the history entry, so Back leaves the list instead of undoing keystrokes.
    if (q !== filter.value.q) navigate({ ...filter.value, q, page: 1 }, true);
  }, SEARCH_DEBOUNCE_MS);
});

// Back/forward or "Xóa bộ lọc" change the URL: show its search in the field.
watch(
  () => filter.value.q,
  (q) => {
    if (searchText.value.trim() === q) return;
    searchText.value = q;
    cancelSearch();
  },
);

onBeforeUnmount(cancelSearch);

/** The search as typed so far, so a status or page change does not drop a pending search. */
function currentQ(): string {
  cancelSearch();
  return searchText.value.trim().slice(0, JOB_LIST_QUERY_MAX_LENGTH);
}

// --- status -------------------------------------------------------------------------------------

const statusOptions = computed<AtsSelectOption[]>(() => [
  { value: 'active', label: t('jobs.list.statusAll') },
  ...(['draft', 'open', 'paused', 'closed'] as const).map((status) => ({
    value: status,
    label: t(`jobs.status.${status}`),
  })),
]);

/** The closed select's face, "Trạng thái: Tất cả" as in the design. */
const statusValueLabel = computed(() => {
  const option = statusOptions.value.find((candidate) => candidate.value === filter.value.status);
  return option ? t('jobs.list.statusValue', { status: option.label }) : undefined;
});

const statusModel = computed<string | null>({
  get: () => filter.value.status,
  set: (value) => {
    const status = jobListStatusSchema.safeParse(value);
    if (!status.success || status.data === filter.value.status) return;
    navigate({ q: currentQ(), status: status.data, page: 1 });
  },
});

function clearFilters() {
  cancelSearch();
  searchText.value = '';
  void router.push({ query: {} });
}

// --- loading ------------------------------------------------------------------------------------

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: JobListResponse }
  | { kind: 'empty' }
  | { kind: 'error'; error: unknown };

const state = ref<State>({ kind: 'loading' });
let latest = 0;

async function load(current: ListFilter) {
  const request = ++latest;
  state.value = { kind: 'loading' };
  try {
    const result = await listJobs(current);
    if (request !== latest) return;
    if (result.items.length === 0 && result.total > 0 && current.page > 1) {
      // Past the last page (an old link, or jobs closed since): show the last one instead.
      navigate({ ...current, page: Math.ceil(result.total / result.pageSize) }, true);
      return;
    }
    if (result.total === 0 && current.q === '' && current.status === 'active') {
      const closed = await listJobs({ status: 'closed' });
      if (request !== latest) return;
      if (closed.total === 0) {
        state.value = { kind: 'empty' };
        return;
      }
    }
    state.value = { kind: 'ready', result };
  } catch (error) {
    if (request === latest) state.value = { kind: 'error', error };
  }
}

function reload() {
  void load(filter.value);
}

watch(() => JSON.stringify(filter.value), reload, { immediate: true });

const errorText = computed(() => {
  if (state.value.kind !== 'error') return '';
  const { error } = state.value;
  return error instanceof ApiError ? error.translate() : t('errors.unknown');
});

// --- table --------------------------------------------------------------------------------------

const columns = computed<TableColumn[]>(() => [
  { key: 'position', label: t('jobs.list.columns.position'), width: '45%' },
  { key: 'status', label: t('jobs.list.columns.status'), width: '20%', hideOnMobile: true },
  { key: 'owner', label: t('jobs.list.columns.owner'), hideOnMobile: true },
]);

const rowTo = (job: JobSummary) => `/jobs/${encodeURIComponent(job.id)}`;
const ownerName = (job: JobSummary) => job.owner?.name || t('jobs.list.noOwner');

const paging = computed(() => {
  if (state.value.kind !== 'ready') return null;
  const { items, total, page, pageSize } = state.value.result;
  if (total <= pageSize) return null;
  const pageCount = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  return {
    page,
    pageCount,
    range: t('jobs.list.pagination.range', { from, to: from + items.length - 1, total }),
  };
});

function goToPage(page: number) {
  navigate({ q: currentQ(), status: filter.value.status, page });
}

// --- create -------------------------------------------------------------------------------------

const createOpen = ref(false);

function openCreate() {
  createOpen.value = true;
  emit('create');
}

function closeCreate() {
  createOpen.value = false;
}
</script>

<template>
  <div class="jobs-list" data-testid="jobs-list-page">
    <AtsPageHeader
      :title="isCollaborator ? t('jobs.list.titleCollaborator') : t('jobs.list.title')"
      :description="
        isCollaborator ? t('jobs.list.descriptionCollaborator') : t('jobs.list.description')
      "
    >
      <template v-if="canCreate" #actions>
        <AtsButton data-testid="jobs-create" @click="openCreate">{{
          t('jobs.list.create')
        }}</AtsButton>
      </template>
    </AtsPageHeader>

    <AtsPageBody v-if="state.kind === 'empty'" variant="centered" data-testid="jobs-empty">
      <AtsEmptyState
        v-if="isCollaborator || !canCreate"
        :title="t('jobs.list.emptyCollaborator.title')"
        :description="t('jobs.list.emptyCollaborator.description')"
      />
      <AtsEmptyState
        v-else
        :title="t('jobs.list.empty.title')"
        :description="t('jobs.list.empty.description')"
        :action-label="t('jobs.list.empty.action')"
        @action="openCreate"
      />
    </AtsPageBody>

    <template v-else>
      <div class="jobs-list__toolbar" role="search" :aria-label="t('jobs.list.filters')">
        <AtsTextField
          v-model="searchText"
          class="jobs-list__search"
          :label="t('jobs.list.searchLabel')"
          :placeholder="t('jobs.list.searchPlaceholder')"
          :maxlength="JOB_LIST_QUERY_MAX_LENGTH"
          type="text"
          autocomplete="off"
          enterkeyhint="search"
          data-testid="jobs-search"
        />
        <AtsSelect
          v-model="statusModel"
          class="jobs-list__status"
          :label="t('jobs.list.statusLabel')"
          :options="statusOptions"
          :value-label="statusValueLabel"
          data-testid="jobs-status"
        />
      </div>

      <div
        v-if="state.kind === 'loading'"
        class="jobs-list__skeleton"
        role="status"
        aria-busy="true"
        :aria-label="t('jobs.list.loading')"
        data-testid="jobs-loading"
      >
        <div class="jobs-list__skeleton-head"></div>
        <div v-for="n in 5" :key="n" class="jobs-list__skeleton-row">
          <span class="jobs-list__bone jobs-list__bone--title"></span>
          <span class="jobs-list__bone jobs-list__bone--status"></span>
          <span class="jobs-list__bone jobs-list__bone--owner"></span>
        </div>
      </div>

      <AtsPageBody v-else-if="state.kind === 'error'" data-testid="jobs-error">
        <AtsNotice tone="error" :title="t('jobs.list.error')">
          <p class="jobs-list__error-text">{{ errorText }}</p>
          <AtsButton variant="outline" @click="reload">{{ t('jobs.list.retry') }}</AtsButton>
        </AtsNotice>
      </AtsPageBody>

      <AtsPageBody
        v-else-if="state.kind === 'ready' && state.result.items.length === 0"
        variant="centered"
        data-testid="jobs-no-results"
      >
        <AtsEmptyState
          :title="t('jobs.list.noResults.title')"
          :description="t('jobs.list.noResults.description')"
          :action-label="isDefaultFilter ? undefined : t('jobs.list.noResults.action')"
          @action="clearFilters"
        />
      </AtsPageBody>

      <template v-else-if="state.kind === 'ready'">
        <AtsPageBody variant="flush">
          <AtsTable
            :columns="columns"
            :rows="state.result.items"
            row-key="id"
            :row-to="rowTo"
            :caption="t('jobs.list.caption')"
            data-testid="jobs-table"
          >
            <template #cell-position="{ row }">
              <AtsTableCell :primary="row.title" :secondary="row.code" />
              <div class="jobs-list__stacked">
                <AtsBadge :tone="STATUS_TONES[row.status]">{{
                  t(`jobs.status.${row.status}`)
                }}</AtsBadge>
                <span class="jobs-list__stacked-owner">{{ ownerName(row) }}</span>
              </div>
            </template>
            <template #cell-status="{ row }">
              <AtsBadge :tone="STATUS_TONES[row.status]" data-testid="job-status">{{
                t(`jobs.status.${row.status}`)
              }}</AtsBadge>
            </template>
            <template #cell-owner="{ row }">
              <span data-testid="job-owner">{{ ownerName(row) }}</span>
            </template>
          </AtsTable>
        </AtsPageBody>

        <nav
          v-if="paging"
          class="jobs-list__pagination"
          :aria-label="t('jobs.list.pagination.label')"
          data-testid="jobs-pagination"
        >
          <p class="jobs-list__range" aria-live="polite">{{ paging.range }}</p>
          <div class="jobs-list__pages">
            <AtsButton
              variant="outline"
              :disabled="paging.page <= 1"
              data-testid="jobs-page-previous"
              @click="goToPage(paging.page - 1)"
              >{{ t('jobs.list.pagination.previous') }}</AtsButton
            >
            <AtsButton
              variant="outline"
              :disabled="paging.page >= paging.pageCount"
              data-testid="jobs-page-next"
              @click="goToPage(paging.page + 1)"
              >{{ t('jobs.list.pagination.next') }}</AtsButton
            >
          </div>
        </nav>
      </template>
    </template>

    <slot name="create" :open="createOpen" :close="closeCreate" />
  </div>
</template>

<style scoped>
/*
 * Desktop as in Example · Desktop list: the toolbar on a 16 px band with the page's 40 px sides, a
 * 320 px search and the status select beside it, then the table edge to edge (AtsPageBody flush).
 * Below 768 px: 20 px sides, the toolbar stacks at full width, and each row shows one column with
 * the title, code, status and owner stacked (the status and owner columns are hidden).
 */
.jobs-list {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--color-ink);
}

.jobs-list__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: flex-end;
  padding: var(--space-4) 40px;
}

.jobs-list__search {
  flex: 0 1 320px;
  min-width: 0;
}

.jobs-list__status {
  /* Wide enough for the longest face, "Trạng thái: Đang mở tuyển". */
  flex: 0 0 220px;
}

/* The design's toolbar has no visible labels; the fields keep them for assistive technology. */
.jobs-list__toolbar :deep(.ats-field__label) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

.jobs-list__stacked {
  display: none;
}

.jobs-list__stacked-owner {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.jobs-list__error-text {
  margin: 0 0 var(--space-3);
}

.jobs-list__pagination {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 40px;
}

.jobs-list__range {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
}

.jobs-list__pages {
  display: flex;
  gap: var(--space-2);
}

.jobs-list__skeleton-head {
  height: 44px;
  border-bottom: 1px solid var(--color-line);
  background: var(--color-canvas);
}

.jobs-list__skeleton-row {
  display: flex;
  gap: var(--space-6);
  align-items: center;
  height: 56px;
  padding-inline: 40px;
  border-bottom: 1px solid var(--color-line);
}

.jobs-list__bone {
  display: block;
  height: 16px;
  max-width: 100%;
  border-radius: var(--radius-sm);
  background: var(--color-line);
}

.jobs-list__bone--title {
  width: 40%;
}

.jobs-list__bone--status {
  width: 96px;
  height: 28px;
  border-radius: var(--radius-full);
}

.jobs-list__bone--owner {
  width: 120px;
}

@media (max-width: 767px) {
  .jobs-list__toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: var(--space-4) 20px;
  }

  .jobs-list__search,
  .jobs-list__status {
    flex: none;
  }

  .jobs-list__stacked {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-top: var(--space-2);
  }

  .jobs-list__pagination {
    padding: var(--space-4) 20px;
  }

  .jobs-list__skeleton-row {
    padding-inline: 20px;
  }

  .jobs-list__bone--status,
  .jobs-list__bone--owner {
    display: none;
  }
}
</style>
