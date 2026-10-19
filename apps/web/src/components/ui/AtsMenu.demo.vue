<!--
  Gallery demo (/dev/ui): the item states from "QA · Menu item states" (Default, Focus, Disabled,
  Danger; Focus is forced with data-state so it shows without a keyboard), then two live menus with the
  "HỒ SƠ ỨNG VIÊN" example, opened from an outline button (bottom-start) and from an icon button at the
  right edge (bottom-end). The live panel opens in the teleport layer and keeps the panel's theme.
  In the gallery's 360 px panel the items take the mobile size (44 px), as on a phone; the component
  itself switches by viewport width. Sample data is synthetic; developer tooling, so no i18n here.
-->
<script setup lang="ts">
import { ref } from 'vue';
import AtsButton from './AtsButton.vue';
import AtsIconButton from './AtsIconButton.vue';
import AtsMenu from './AtsMenu.vue';
import AtsMenuItem from './AtsMenuItem.vue';

const last = ref('—');
</script>

<template>
  <div class="menu-demo">
    <div class="menu-demo__states" role="menu" aria-label="Menu item states">
      <span class="menu-demo__caption">Default</span>
      <AtsMenuItem label="Mở hồ sơ" icon="profile" data-testid="menu-item-default" />
      <span class="menu-demo__caption">Focus</span>
      <AtsMenuItem
        label="Chỉnh sửa hồ sơ"
        icon="edit"
        data-state="focus"
        data-testid="menu-item-focus"
      />
      <span class="menu-demo__caption">Disabled</span>
      <AtsMenuItem
        label="Không khả dụng"
        icon="profile"
        disabled
        data-testid="menu-item-disabled"
      />
      <span class="menu-demo__caption">Danger</span>
      <AtsMenuItem label="Lưu trữ hồ sơ" icon="archive-box" danger data-testid="menu-item-danger" />
    </div>

    <div class="menu-demo__live">
      <AtsMenu heading="Hồ sơ ứng viên">
        <template #trigger="{ props }">
          <AtsButton v-bind="props" variant="outline" data-testid="menu-trigger"
            >Thao tác</AtsButton
          >
        </template>
        <AtsMenuItem label="Mở hồ sơ" icon="profile" @select="last = 'Mở hồ sơ'" />
        <AtsMenuItem label="Chỉnh sửa hồ sơ" icon="edit" @select="last = 'Chỉnh sửa hồ sơ'" />
        <AtsMenuItem label="Không khả dụng" icon="profile" disabled />
        <AtsMenuItem
          label="Lưu trữ hồ sơ"
          icon="archive-box"
          danger
          @select="last = 'Lưu trữ hồ sơ'"
        />
      </AtsMenu>

      <AtsMenu heading="Hồ sơ ứng viên" placement="bottom-end">
        <template #trigger="{ props }">
          <AtsIconButton
            v-bind="props"
            icon="edit"
            label="Thao tác"
            data-testid="menu-trigger-end"
          />
        </template>
        <AtsMenuItem label="Mở hồ sơ" icon="profile" @select="last = 'Mở hồ sơ'" />
        <AtsMenuItem label="Chỉnh sửa hồ sơ" icon="edit" @select="last = 'Chỉnh sửa hồ sơ'" />
        <AtsMenuItem label="Không khả dụng" icon="profile" disabled />
        <AtsMenuItem
          label="Lưu trữ hồ sơ"
          icon="archive-box"
          danger
          @select="last = 'Lưu trữ hồ sơ'"
        />
      </AtsMenu>
    </div>
    <span class="menu-demo__caption">Last selected: {{ last }}</span>
  </div>
</template>

<style scoped>
.menu-demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.menu-demo__states {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  max-width: 232px;
}

.menu-demo__caption {
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.menu-demo__live {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

/* The gallery's 360 px panel is narrow but sits on a wide viewport: show the mobile size there. */
[data-panel='mobile'] .menu-demo .ats-menu-item {
  min-height: var(--touch-target-min);
}
</style>
