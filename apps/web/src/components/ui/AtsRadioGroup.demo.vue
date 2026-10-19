<!--
  Gallery demo (/dev/ui): every state from "QA · Radio states" plus the specimens. Focus is pinned with a
  demo-only class so it can be compared side by side; the real state comes from :focus-visible in
  AtsRadio. Sample data is synthetic; developer tooling, so no i18n here. The gallery mounts this demo
  once per panel in one document, so every group name carries a per-instance suffix; otherwise the
  same-named native radios would form one group across panels and only the last panel stays checked.
-->
<script setup lang="ts">
import { ref, useId } from 'vue';
import AtsRadio from './AtsRadio.vue';
import AtsRadioGroup from './AtsRadioGroup.vue';

const id = useId();
const name = (group: string) => `demo-${group}-${id}`;

const unselected = ref<string>();
const selected = ref('global');
const focus = ref('global');
const disabled = ref('global');
const error = ref<string>();
const remote = ref('countries');
const salary = ref('negotiable');
const mobile = ref('approved');
</script>

<template>
  <div class="radio-demo">
    <section data-state="unselected">
      <AtsRadioGroup v-model="unselected" :name="name('unselected')" legend="Default · Unselected">
        <AtsRadio value="global" label="Toàn cầu" />
      </AtsRadioGroup>
    </section>

    <section data-state="selected">
      <AtsRadioGroup v-model="selected" :name="name('selected')" legend="Default · Selected">
        <AtsRadio value="global" label="Toàn cầu" />
      </AtsRadioGroup>
    </section>

    <section data-state="focus" class="radio-demo--focus">
      <AtsRadioGroup v-model="focus" :name="name('focus')" legend="Focus · Selected">
        <AtsRadio value="global" label="Toàn cầu" />
      </AtsRadioGroup>
    </section>

    <section data-state="disabled">
      <AtsRadioGroup
        v-model="disabled"
        :name="name('disabled')"
        legend="Disabled · Selected"
        disabled
      >
        <AtsRadio value="global" label="Toàn cầu" />
      </AtsRadioGroup>
    </section>

    <section data-state="error">
      <AtsRadioGroup
        v-model="error"
        :name="name('error')"
        legend="Error · Unselected"
        error="Chọn một phạm vi áp dụng trước khi tiếp tục."
      >
        <AtsRadio value="global" label="Toàn cầu" />
      </AtsRadioGroup>
    </section>

    <section data-state="group">
      <AtsRadioGroup v-model="remote" :name="name('remote')" legend="Remote eligibility">
        <AtsRadio value="global" label="Toàn cầu" />
        <AtsRadio value="countries" label="Các quốc gia được chọn" />
        <AtsRadio value="regions" label="Chỉ các khu vực được chỉ định" />
      </AtsRadioGroup>
    </section>

    <section data-state="disabled-option">
      <AtsRadioGroup v-model="salary" :name="name('salary')" legend="Salary visibility">
        <AtsRadio value="hidden" label="Không hiển thị" />
        <AtsRadio value="negotiable" label="Thỏa thuận" />
        <AtsRadio value="range" label="Khoảng lương đã bị khóa" disabled />
      </AtsRadioGroup>
    </section>

    <section data-state="long">
      <AtsRadioGroup
        v-model="mobile"
        :name="name('long')"
        legend="Long label · hidden legend"
        hide-legend
      >
        <AtsRadio
          value="approved"
          label="Cho phép làm việc từ xa tại các quốc gia được nhà tuyển dụng phê duyệt"
        />
        <AtsRadio value="office" label="Chỉ làm việc tại văn phòng" />
      </AtsRadioGroup>
    </section>
  </div>
</template>

<style scoped>
/* "QA · Radio states": 20 px between groups. */
.radio-demo {
  display: grid;
  gap: 20px;
  max-width: 480px;
}

/* Demo-only copy of the :focus-visible rule in AtsRadio.vue. */
.radio-demo--focus :deep(.ats-radio__control) {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
</style>
