<!--
  Gallery demo (/dev/ui): the three tones with a title, as in "QA · Notice spacing", then a notice
  without a title and a long Vietnamese message that must wrap fully in the 360 px panel. Developer
  tooling, not product copy: no i18n here.
-->
<script setup lang="ts">
import AtsNotice from './AtsNotice.vue';
</script>

<template>
  <div class="notice-demo">
    <AtsNotice tone="info" title="Thông tin" data-testid="notice-info">
      Nội dung được chia sẻ trong phạm vi bạn có quyền truy cập.
    </AtsNotice>
    <AtsNotice tone="success" title="Đã hoàn tất" data-testid="notice-success">
      Đã lưu thay đổi thành công.
    </AtsNotice>
    <AtsNotice tone="error" title="Cần xử lý" data-testid="notice-error">
      Không thể lưu thay đổi. Kiểm tra nội dung rồi thử lại.
    </AtsNotice>
    <AtsNotice tone="success" data-testid="notice-untitled">
      Đã lưu thay đổi và cập nhật nội dung hiển thị.
    </AtsNotice>
    <AtsNotice tone="info" title="Thông tin dài" data-testid="notice-long">
      Thông báo tiếng Việt dài được phép xuống dòng mà vẫn giữ đủ khoảng đệm nội dung. Hồ sơ này
      được chia sẻ giữa các ứng tuyển mà bạn có quyền truy cập, kể cả khi nội dung kéo dài nhiều
      dòng.
    </AtsNotice>
  </div>
</template>

<style scoped>
.notice-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 480px;
}
</style>
