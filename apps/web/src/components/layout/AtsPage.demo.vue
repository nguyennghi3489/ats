<!--
  Gallery demo (/dev/ui): AtsPageHeader with AtsPageBody, after "02 · App shell" > ATS/Page wrapper.
  - list: title, description and the primary action over a flush table (Example · Desktop list);
  - empty: the same header over a centered empty state (Example · Empty workspace);
  - breadcrumb: a record-style title with the breadcrumb above it and a padded body;
  - long-title: a title long enough to wrap beside the action.
  The jobs are fictional. Developer tooling, so no i18n here.
-->
<script setup lang="ts">
import AtsButton from '../ui/AtsButton.vue';
import AtsEmptyState from '../ui/AtsEmptyState.vue';
import AtsTable, { type TableColumn } from '../ui/AtsTable.vue';
import AtsPageBody from './AtsPageBody.vue';
import AtsPageHeader from './AtsPageHeader.vue';

interface DemoJob {
  id: string;
  title: string;
  status: string;
  owner: string;
}

const TITLE = 'Vị trí tuyển dụng';
const DESCRIPTION = 'Quản lý tất cả vị trí tuyển dụng và theo dõi trạng thái đăng tuyển.';
const LONG_TITLE =
  'Chuyên viên Phát triển Đối tác Doanh nghiệp Khu vực Đông Nam Á và Thái Bình Dương cho khối khách hàng chiến lược';

const columns: TableColumn[] = [
  { key: 'title', label: 'Vị trí', width: '45%' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'owner', label: 'Phụ trách', hideOnMobile: true },
];

const jobs: DemoJob[] = [
  { id: 'j-1', title: 'Product Designer', status: 'Đang mở tuyển', owner: 'Minh Anh' },
  {
    id: 'j-2',
    title: 'Chuyên viên Phát triển Đối tác Doanh nghiệp Khu vực Đông Nam Á',
    status: 'Đang mở tuyển',
    owner: 'Minh Anh',
  },
  { id: 'j-3', title: 'Kỹ sư Frontend', status: 'Bản nháp', owner: 'Minh Anh' },
];
</script>

<template>
  <div class="page-demo">
    <section class="page-demo__example" data-example="list">
      <h4 class="page-demo__state">List</h4>
      <div class="page-demo__page">
        <AtsPageHeader :title="TITLE" :description="DESCRIPTION">
          <template #actions>
            <AtsButton>Tạo vị trí</AtsButton>
          </template>
        </AtsPageHeader>
        <AtsPageBody variant="flush">
          <AtsTable :columns="columns" :rows="jobs" row-key="id" caption="Vị trí tuyển dụng" />
        </AtsPageBody>
      </div>
    </section>

    <section class="page-demo__example" data-example="empty">
      <h4 class="page-demo__state">Empty state</h4>
      <div class="page-demo__page page-demo__page--tall">
        <AtsPageHeader :title="TITLE" :description="DESCRIPTION">
          <template #actions>
            <AtsButton>Tạo vị trí đầu tiên</AtsButton>
          </template>
        </AtsPageHeader>
        <AtsPageBody variant="centered">
          <AtsEmptyState
            title="Chưa có vị trí tuyển dụng"
            description="Tạo vị trí đầu tiên để bắt đầu nhận và quản lý ứng tuyển."
            action-label="Tạo vị trí đầu tiên"
          />
        </AtsPageBody>
      </div>
    </section>

    <section class="page-demo__example" data-example="breadcrumb">
      <h4 class="page-demo__state">Breadcrumb</h4>
      <div class="page-demo__page">
        <AtsPageHeader title="Product Designer" description="Mã tham chiếu: AN-001">
          <template #breadcrumb>
            <nav aria-label="Breadcrumb">
              <a href="#jobs" class="page-demo__crumb">Vị trí tuyển dụng</a>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">Product Designer</span>
            </nav>
          </template>
          <template #actions>
            <AtsButton variant="outline">Thao tác tuyển dụng</AtsButton>
          </template>
        </AtsPageHeader>
        <AtsPageBody>
          <p class="page-demo__text">Theo dõi ứng viên và tiến độ tuyển dụng cho vị trí này.</p>
        </AtsPageBody>
      </div>
    </section>

    <section class="page-demo__example" data-example="long-title">
      <h4 class="page-demo__state">Long title</h4>
      <div class="page-demo__page">
        <AtsPageHeader :title="LONG_TITLE" :description="DESCRIPTION">
          <template #actions>
            <AtsButton>Tạo vị trí</AtsButton>
          </template>
        </AtsPageHeader>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-demo {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-4);
}

.page-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

/* A stand-in for the app's content column: the page surface, with the body free to fill it. */
.page-demo__page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--color-line);
  background: var(--color-surface);
}

.page-demo__page--tall {
  min-height: 420px;
}

.page-demo__crumb {
  color: inherit;
}

.page-demo__text {
  margin: 0;
  color: var(--color-muted);
}
</style>
