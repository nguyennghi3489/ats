<!--
  Gallery demo (/dev/ui): the "QA · Tab states" board. Each state is a one-tab row so it can be selected
  or not on its own; Hover and Focus are forced with data-state so they show without a pointer or the
  keyboard. Below it, a working row (click and arrow keys) with a disabled tab and labels of one, two and
  three lines. Developer tooling, not product copy: no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsTab from './AtsTab.vue';
import AtsTabs from './AtsTabs.vue';

const states = [
  { id: 'default-unselected', title: 'Default · Unselected', selected: false },
  { id: 'default-selected', title: 'Default · Selected', selected: true },
  { id: 'hover-unselected', title: 'Hover · Unselected', selected: false, force: 'hover' },
  { id: 'focus-unselected', title: 'Focus · Unselected', selected: false, force: 'focus' },
  { id: 'focus-selected', title: 'Focus · Selected', selected: true, force: 'focus' },
  { id: 'disabled-unselected', title: 'Disabled · Unselected', selected: false, disabled: true },
  { id: 'disabled-selected', title: 'Disabled · Selected', selected: true, disabled: true },
] as const;

const lines = [
  { value: 'one', label: 'Ứng tuyển', title: '1 line' },
  { value: 'two', label: 'Ứng tuyển dài', title: '2 lines' },
  { value: 'three', label: 'Ứng tuyển cần xem xét', title: '3 lines' },
] as const;

const job = ref('content');
</script>

<template>
  <div class="tabs-demo">
    <div class="tabs-demo__states">
      <div v-for="state in states" :key="state.id" class="tabs-demo__item">
        <span class="tabs-demo__caption">{{ state.title }}</span>
        <AtsTabs :model-value="state.selected ? 'apply' : undefined" :label="state.title">
          <AtsTab
            value="apply"
            label="Ứng tuyển"
            :disabled="'disabled' in state"
            :data-state="'force' in state ? state.force : undefined"
            :data-testid="`tab-${state.id}`"
          />
        </AtsTabs>
      </div>
    </div>

    <div class="tabs-demo__states">
      <div v-for="line in lines" :key="line.value" class="tabs-demo__item">
        <span class="tabs-demo__caption">{{ line.title }}</span>
        <AtsTabs :model-value="line.value" :label="line.title">
          <AtsTab
            :value="line.value"
            :label="line.label"
            :data-testid="`tab-lines-${line.value}`"
          />
        </AtsTabs>
      </div>
    </div>

    <div class="tabs-demo__item">
      <span class="tabs-demo__caption">Job tabs · click or use the arrow keys</span>
      <AtsTabs v-model="job" label="Job tabs" data-testid="tabs-job">
        <AtsTab value="apply" label="Ứng tuyển" />
        <AtsTab value="plan" label="Kế hoạch" />
        <AtsTab value="content" label="Nội dung" />
        <AtsTab value="process" label="Quy trình" disabled />
        <AtsTab value="access" label="Nhóm & quyền truy cập" />
        <AtsTab value="review" label="Ứng tuyển cần xem xét" />
      </AtsTabs>
    </div>
  </div>
</template>

<style scoped>
.tabs-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.tabs-demo__states {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.tabs-demo__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.tabs-demo__caption {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}
</style>
