<!--
  Gallery demo (/dev/ui): the "Lưu trữ hồ sơ ứng viên?" specimen from "QA · Dialog assembled spacing",
  drawn inline so each panel shows it in its theme and width (the 360 px panel takes the narrow layout
  with stacked actions). Below it, buttons open the live modal dialogs: the archive example (its primary
  action runs for a moment as pending, so Escape and the close button do nothing meanwhile) and a
  long-body example whose body scrolls inside the dialog while the footer stays reachable.
  Sample data is synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
/* global setTimeout -- timer global, which no-undef does not know in .vue files */
import { ref } from 'vue';
import AtsButton from './AtsButton.vue';
import AtsDialog from './AtsDialog.vue';

const BODY =
  'Hồ sơ sẽ được đưa ra khỏi danh sách làm việc mặc định. Các lượt ứng tuyển hiện có không thay đổi và bạn có thể khôi phục hồ sơ sau.';

const archiveOpen = ref(false);
const archivePending = ref(false);
const longOpen = ref(false);
const last = ref('—');

function archive() {
  archivePending.value = true;
  setTimeout(() => {
    archivePending.value = false;
    archiveOpen.value = false;
    last.value = 'Đã lưu trữ';
  }, 1500);
}

const paragraphs = Array.from(
  { length: 30 },
  (_, i) =>
    `Mục ${i + 1}. Ứng viên mẫu Nguyễn Văn A đã ứng tuyển vị trí Kỹ sư phần mềm. Nội dung dài để kiểm tra phần thân cuộn bên trong hộp thoại.`,
);
</script>

<template>
  <div class="dialog-demo">
    <AtsDialog
      inline
      :open="true"
      title="Lưu trữ hồ sơ ứng viên?"
      close-label="Đóng"
      data-testid="dialog-specimen"
    >
      <p>{{ BODY }}</p>
      <template #footer>
        <AtsButton variant="outline">Hủy</AtsButton>
        <AtsButton>Lưu trữ hồ sơ</AtsButton>
      </template>
    </AtsDialog>

    <div class="dialog-demo__live">
      <AtsButton variant="outline" data-testid="dialog-open-archive" @click="archiveOpen = true"
        >Mở hộp thoại lưu trữ</AtsButton
      >
      <AtsButton variant="outline" data-testid="dialog-open-long" @click="longOpen = true"
        >Mở hộp thoại nội dung dài</AtsButton
      >
    </div>
    <span class="dialog-demo__caption">Last action: {{ last }}</span>

    <AtsDialog
      v-model:open="archiveOpen"
      title="Lưu trữ hồ sơ ứng viên?"
      close-label="Đóng"
      :pending="archivePending"
    >
      <p>{{ BODY }}</p>
      <template #footer>
        <AtsButton variant="outline" :disabled="archivePending" @click="archiveOpen = false"
          >Hủy</AtsButton
        >
        <AtsButton :pending="archivePending" @click="archive">{{
          archivePending ? 'Đang lưu trữ' : 'Lưu trữ hồ sơ'
        }}</AtsButton>
      </template>
    </AtsDialog>

    <AtsDialog v-model:open="longOpen" title="Điều khoản xử lý dữ liệu" close-label="Đóng">
      <p v-for="text in paragraphs" :key="text">{{ text }}</p>
      <template #footer>
        <AtsButton variant="outline" @click="longOpen = false">Hủy</AtsButton>
        <AtsButton
          @click="
            longOpen = false;
            last = 'Đã đồng ý';
          "
          >Đồng ý</AtsButton
        >
      </template>
    </AtsDialog>
  </div>
</template>

<style scoped>
.dialog-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dialog-demo__live {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.dialog-demo__caption {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}
</style>
