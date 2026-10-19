<!--
  Gallery demo (/dev/ui): every state from "QA · Select field states". Hover and focus are pinned with
  demo-only classes so they can be compared side by side; the real states come from :hover and
  :focus-visible in AtsSelect. Sample data is synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsSelect from './AtsSelect.vue';

const PEOPLE = [
  { value: 'minh-anh', label: 'Nguyễn Minh Anh' },
  { value: 'thu-ha', label: 'Trần Thu Hà' },
  { value: 'quoc-bao', label: 'Lê Quốc Bảo', disabled: true },
];
const EMPLOYMENT = [
  { value: 'full_time', label: 'Toàn thời gian' },
  { value: 'part_time', label: 'Bán thời gian' },
  { value: 'contract', label: 'Hợp đồng' },
];
const LONG = [
  { value: 'long', label: 'Tên tiếng Việt rất dài để kiểm tra xuống dòng trên màn hình hẹp' },
  { value: 'short', label: 'Ngắn' },
];

const person = ref<string | null>('minh-anh');
const employment = ref<string | null>(null);
const long = ref<string | null>('long');

const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra lựa chọn và thử lại.';
</script>

<template>
  <div class="select-demo">
    <section data-state="default">
      <h4 class="select-demo__state">Default</h4>
      <AtsSelect v-model="person" label="Tên hiển thị" :options="PEOPLE" :helper="HELPER" />
    </section>

    <section data-state="placeholder">
      <h4 class="select-demo__state">Placeholder · required</h4>
      <AtsSelect
        v-model="employment"
        label="Loại hình việc làm"
        :options="EMPLOYMENT"
        placeholder="Chọn loại hình"
        required
      />
    </section>

    <section data-state="hover" class="select-demo--hover">
      <h4 class="select-demo__state">Hover</h4>
      <AtsSelect v-model="person" label="Tên hiển thị" :options="PEOPLE" :helper="HELPER" />
    </section>

    <section data-state="focus" class="select-demo--focus">
      <h4 class="select-demo__state">Focus</h4>
      <AtsSelect v-model="person" label="Tên hiển thị" :options="PEOPLE" :helper="HELPER" />
    </section>

    <section data-state="error">
      <h4 class="select-demo__state">Error</h4>
      <AtsSelect v-model="person" label="Tên ứng viên" :options="PEOPLE" :error="ERROR" required />
    </section>

    <section data-state="error-focus" class="select-demo--focus">
      <h4 class="select-demo__state">Error + focus</h4>
      <AtsSelect v-model="person" label="Tên ứng viên" :options="PEOPLE" :error="ERROR" required />
    </section>

    <section data-state="disabled">
      <h4 class="select-demo__state">Disabled</h4>
      <AtsSelect
        v-model="person"
        label="Tên hiển thị"
        :options="PEOPLE"
        :helper="HELPER"
        disabled
      />
    </section>

    <section data-state="long">
      <h4 class="select-demo__state">Long value · error</h4>
      <AtsSelect v-model="long" label="Tên ứng viên" :options="LONG" :error="ERROR" />
    </section>
  </div>
</template>

<style scoped>
.select-demo {
  display: grid;
  gap: var(--space-4);
  width: 100%;
  max-width: 480px;
}

.select-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

/* Demo-only copies of the :hover and :focus-visible rules in AtsSelect.vue. */
.select-demo--hover :deep(.ats-select__box) {
  border-color: var(--color-action-line);
}

.select-demo--focus :deep(.ats-select__box) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
