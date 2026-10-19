<!--
  Gallery demo (/dev/ui): the no-results state with a "Xóa bộ lọc" action, one without an action and one
  with a long Vietnamese description that has to wrap at 360 px. Sample copy is synthetic; developer
  tooling, so no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsEmptyState from './AtsEmptyState.vue';

const cleared = ref(0);

const LONG_DESCRIPTION =
  'Mô tả tiếng Việt dài giải thích trạng thái trống và hướng dẫn bước tiếp theo mà không tràn khung, kể cả khi hồ sơ đã lưu trữ chỉ xuất hiện lúc bạn chọn bao gồm hồ sơ đã lưu trữ.';
</script>

<template>
  <div class="empty-state-demo">
    <section data-state="action">
      <h4 class="empty-state-demo__state">With action · cleared {{ cleared }}×</h4>
      <AtsEmptyState
        title="Không có kết quả phù hợp"
        description="Thử thay đổi từ khóa hoặc bộ lọc để tìm nội dung phù hợp."
        action-label="Xóa bộ lọc"
        :heading-level="5"
        @action="cleared++"
      />
    </section>

    <section data-state="no-action">
      <h4 class="empty-state-demo__state">Without action</h4>
      <AtsEmptyState
        title="Chưa có ứng tuyển"
        description="Khi ứng viên được thêm vào vị trí này, các lượt ứng tuyển sẽ xuất hiện tại đây."
        :heading-level="5"
      />
    </section>

    <section data-state="long">
      <h4 class="empty-state-demo__state">Long description</h4>
      <AtsEmptyState title="Chưa có nội dung" :description="LONG_DESCRIPTION" :heading-level="5" />
    </section>
  </div>
</template>

<style scoped>
.empty-state-demo {
  display: grid;
  gap: var(--space-4);
}

.empty-state-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}
</style>
