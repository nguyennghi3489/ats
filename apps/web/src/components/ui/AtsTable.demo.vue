<!--
  Gallery demo (/dev/ui): the table specimens from "01 · Foundations" and "QA · Table row spacing".
  A clickable table (rows lead to an in-page hash, so the gallery stays open) with two short rows and
  one very long name, then the same rows without `rowTo`. "Liên hệ" is hidden below 768 px.
  The people are fictional and the phones are already masked, as a list would do (decisions §13).
  Developer tooling, so no i18n here.
-->
<script setup lang="ts">
import AtsTable, { type TableColumn } from './AtsTable.vue';
import AtsTableCell from './AtsTableCell.vue';

interface DemoRow {
  id: string;
  name: string;
  note: string;
  email: string;
  phone: string;
  applications: string;
}

const columns: TableColumn[] = [
  { key: 'profile', label: 'Hồ sơ', width: '35%' },
  { key: 'contact', label: 'Liên hệ', width: '33%', hideOnMobile: true },
  { key: 'applications', label: 'Ứng tuyển' },
];

const rows: DemoRow[] = [
  {
    id: 'c-1',
    name: 'Nguyễn Minh Anh',
    note: 'Hồ sơ mới chưa có ứng tuyển',
    email: 'minh.anh@example.com',
    phone: '••• •••842',
    applications: '0 lượt ứng tuyển',
  },
  {
    id: 'c-2',
    name: 'Trần Khánh Linh',
    note: 'Hồ sơ có 2 lượt ứng tuyển',
    email: 'khanh.linh@example.com',
    phone: '••• •••517',
    applications: '2 ứng tuyển có thể truy cập',
  },
  {
    id: 'c-3',
    name: 'Tên ứng viên rất dài để kiểm tra xuống dòng trong ô của bảng',
    note: 'Nội dung dài',
    email: 'ung.vien.ten.rat.dai@example.com',
    phone: '••• •••203',
    applications: '1 ứng tuyển',
  },
];

const rowTo = (row: DemoRow) => ({ hash: `#${row.id}` });
</script>

<template>
  <div class="table-demo">
    <section data-state="clickable">
      <h4 class="table-demo__state">With rowTo</h4>
      <AtsTable
        :columns="columns"
        :rows="rows"
        row-key="id"
        :row-to="rowTo"
        caption="Hồ sơ ứng viên"
      >
        <template #cell-profile="{ row }">
          <AtsTableCell :primary="row.name" :secondary="row.note" />
        </template>
        <template #cell-contact="{ row }">
          <AtsTableCell :primary="row.email" :secondary="row.phone" />
        </template>
      </AtsTable>
    </section>
    <section data-state="static">
      <h4 class="table-demo__state">Without rowTo</h4>
      <AtsTable :columns="columns" :rows="rows" row-key="id" caption="Hồ sơ ứng viên (chỉ xem)">
        <template #cell-profile="{ row }">
          <AtsTableCell :primary="row.name" :secondary="row.note" />
        </template>
        <template #cell-contact="{ row }">
          <AtsTableCell :primary="row.email" :secondary="row.phone" />
        </template>
      </AtsTable>
    </section>
  </div>
</template>

<style scoped>
.table-demo {
  display: grid;
  gap: var(--space-4);
}

.table-demo__state {
  margin: 0 0 var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}
</style>
