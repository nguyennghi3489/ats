<!--
  Gallery demo (/dev/ui): every state from "QA · Text field states". Hover and focus are pinned with
  demo-only classes so they can be compared side by side; the real states come from :hover and
  :focus-visible in AtsTextField. Sample data is synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsTextField from './AtsTextField.vue';

const name = ref('Nguyễn Minh Anh');
const empty = ref('');
const email = ref('tuyen-dung@example.com');
// 60 characters: a single-line value must scroll, never wrap.
const long = ref('Chuyên viên thiết kế trải nghiệm người dùng cấp cao ở Hà Nội');

const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra nội dung đã nhập';
</script>

<template>
  <div class="text-field-demo">
    <section data-state="default">
      <h4 class="text-field-demo__state">Default</h4>
      <AtsTextField v-model="name" label="Tên hiển thị" :helper="HELPER" />
    </section>

    <section data-state="placeholder">
      <h4 class="text-field-demo__state">Placeholder · required</h4>
      <AtsTextField
        v-model="empty"
        label="Tên ứng viên"
        placeholder="Nhập tên đầy đủ"
        required
        autocomplete="name"
      />
    </section>

    <section data-state="hover" class="text-field-demo--hover">
      <h4 class="text-field-demo__state">Hover</h4>
      <AtsTextField v-model="name" label="Tên hiển thị" :helper="HELPER" />
    </section>

    <section data-state="focus" class="text-field-demo--focus">
      <h4 class="text-field-demo__state">Focus</h4>
      <AtsTextField v-model="name" label="Tên hiển thị" :helper="HELPER" />
    </section>

    <section data-state="error">
      <h4 class="text-field-demo__state">Error</h4>
      <AtsTextField v-model="name" label="Tên ứng viên" :helper="HELPER" :error="ERROR" required />
    </section>

    <section data-state="error-focus" class="text-field-demo--focus">
      <h4 class="text-field-demo__state">Error + focus</h4>
      <AtsTextField v-model="name" label="Tên ứng viên" :error="ERROR" required />
    </section>

    <section data-state="disabled">
      <h4 class="text-field-demo__state">Disabled</h4>
      <AtsTextField v-model="name" label="Tên hiển thị" :helper="HELPER" disabled />
    </section>

    <section data-state="readonly">
      <h4 class="text-field-demo__state">Read-only</h4>
      <AtsTextField
        v-model="name"
        label="Tên hiển thị"
        helper="Chỉ đọc · nội dung vẫn hiển thị đầy đủ"
        readonly
      />
    </section>

    <section data-state="long">
      <h4 class="text-field-demo__state">Long value · error</h4>
      <AtsTextField v-model="long" label="Tên vị trí tuyển dụng" :error="ERROR" />
    </section>

    <section data-state="email">
      <h4 class="text-field-demo__state">Email</h4>
      <AtsTextField
        v-model="email"
        type="email"
        label="Email người phụ trách tuyển dụng"
        autocomplete="email"
      />
    </section>
  </div>
</template>

<style scoped>
.text-field-demo {
  display: grid;
  gap: var(--space-4);
  max-width: 480px;
}

.text-field-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

/* Demo-only copies of the :hover and :focus-visible rules in AtsTextField.vue. */
.text-field-demo--hover :deep(.ats-text-field__box) {
  border-color: var(--color-action-line);
}

.text-field-demo--focus :deep(.ats-text-field__box) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
