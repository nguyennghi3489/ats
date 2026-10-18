<!--
  Gallery demo (/dev/ui): every state from "QA · Textarea states". Hover and focus are pinned with
  demo-only classes so they can be compared side by side; the real states come from :hover and
  :focus-visible in AtsTextarea. Sample data is synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsTextarea from './AtsTextarea.vue';

const name = ref('Nguyễn Minh Anh');
const empty = ref('');
const short = ref('Nội dung quá ngắn');
// Long Vietnamese content: it must wrap inside the control, never scroll sideways.
const long = ref(
  'Thiết kế trải nghiệm tuyển dụng rõ ràng, nhất quán và dễ sử dụng cho đội ngũ tuyển dụng. ' +
    'Ứng viên đã hoàn thành vòng phỏng vấn kỹ thuật, cần trao đổi thêm về mức lương mong muốn và ' +
    'thời gian có thể bắt đầu làm việc.',
);
const unbroken = ref('TêntiếngViệtrấtdàiđểkiểmtraxuốngdòngtrênmànhìnhhẹpmàkhôngcuộnngang');

const HELPER = 'Thông tin này được dùng trong hồ sơ chia sẻ.';
const ERROR = 'Vui lòng kiểm tra nội dung và thử lại.';
</script>

<template>
  <div class="textarea-demo">
    <section data-state="default">
      <h4 class="textarea-demo__state">Default</h4>
      <AtsTextarea v-model="name" label="Ghi chú" :helper="HELPER" />
    </section>

    <section data-state="placeholder">
      <h4 class="textarea-demo__state">Placeholder · required</h4>
      <AtsTextarea
        v-model="empty"
        label="Nhãn trường"
        placeholder="Nhập ghi chú chi tiết cho ứng viên, bao gồm bối cảnh và bước tiếp theo."
        required
      />
    </section>

    <section data-state="hover" class="textarea-demo--hover">
      <h4 class="textarea-demo__state">Hover</h4>
      <AtsTextarea v-model="name" label="Ghi chú" :helper="HELPER" />
    </section>

    <section data-state="focus" class="textarea-demo--focus">
      <h4 class="textarea-demo__state">Focus</h4>
      <AtsTextarea v-model="name" label="Ghi chú" :helper="HELPER" />
    </section>

    <section data-state="error">
      <h4 class="textarea-demo__state">Error</h4>
      <AtsTextarea v-model="name" label="Ghi chú" :helper="HELPER" :error="ERROR" required />
    </section>

    <section data-state="error-focus" class="textarea-demo--focus">
      <h4 class="textarea-demo__state">Error + focus</h4>
      <AtsTextarea v-model="long" label="Ghi chú" :error="ERROR" />
    </section>

    <section data-state="disabled">
      <h4 class="textarea-demo__state">Disabled</h4>
      <AtsTextarea v-model="name" label="Ghi chú" :helper="HELPER" disabled />
    </section>

    <section data-state="readonly">
      <h4 class="textarea-demo__state">Read-only</h4>
      <AtsTextarea
        v-model="long"
        label="Nhãn trường"
        helper="Chỉ đọc · nội dung vẫn hiển thị đầy đủ"
        readonly
      />
    </section>

    <section data-state="long">
      <h4 class="textarea-demo__state">Long Vietnamese text</h4>
      <AtsTextarea v-model="long" label="Nhãn trường" :maxlength="2000" />
    </section>

    <section data-state="short-error">
      <h4 class="textarea-demo__state">Short value · error</h4>
      <AtsTextarea v-model="short" label="Nhãn trường" error="Mô tả cần có ít nhất 80 ký tự" />
    </section>

    <section data-state="unbroken">
      <h4 class="textarea-demo__state">Unbroken word · error</h4>
      <AtsTextarea v-model="unbroken" label="Ghi chú" :error="ERROR" />
    </section>
  </div>
</template>

<style scoped>
.textarea-demo {
  display: grid;
  gap: var(--space-4);
  max-width: 480px;
}

.textarea-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

/* Demo-only copies of the :hover and :focus-visible rules in AtsTextarea.vue. */
.textarea-demo--hover :deep(.ats-textarea__control) {
  border-color: var(--color-action-line);
}

.textarea-demo--focus :deep(.ats-textarea__control) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
