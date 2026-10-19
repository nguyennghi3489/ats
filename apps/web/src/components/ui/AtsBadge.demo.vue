<!--
  Gallery demo (/dev/ui): the four tones from "QA · Badge spacing", an icon example and a long text in a
  120 px container that truncates (hover it for the full text). Sample labels are synthetic; developer
  tooling, so no i18n here.
-->
<script setup lang="ts">
import AtsBadge from './AtsBadge.vue';
import AtsIcon from './AtsIcon.vue';

const tones = [
  { tone: 'neutral', label: 'Nhãn' },
  { tone: 'accent', label: 'Nổi bật' },
  { tone: 'success', label: 'Đã xác minh' },
  { tone: 'danger', label: 'Không thể lưu' },
] as const;

const LONG_TEXT = 'Đã xác minh bởi người phụ trách tuyển dụng';
</script>

<template>
  <div class="badge-demo">
    <section data-state="tones">
      <h4 class="badge-demo__state">Tones</h4>
      <div class="badge-demo__row">
        <AtsBadge v-for="item in tones" :key="item.tone" :tone="item.tone">
          {{ item.label }}
        </AtsBadge>
      </div>
    </section>

    <section data-state="icon">
      <h4 class="badge-demo__state">With icon</h4>
      <div class="badge-demo__row">
        <AtsBadge tone="success">
          <template #icon><AtsIcon name="success" /></template>
          Đã xác minh
        </AtsBadge>
        <AtsBadge tone="danger">
          <template #icon><AtsIcon name="error" /></template>
          Không thể lưu
        </AtsBadge>
      </div>
    </section>

    <section data-state="long">
      <h4 class="badge-demo__state">Long text · 120 px container</h4>
      <div class="badge-demo__narrow">
        <AtsBadge tone="accent">{{ LONG_TEXT }}</AtsBadge>
      </div>
    </section>
  </div>
</template>

<style scoped>
.badge-demo {
  display: grid;
  gap: var(--space-4);
}

.badge-demo__state {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

.badge-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.badge-demo__narrow {
  width: 120px;
  outline: 1px dashed var(--color-line);
}
</style>
