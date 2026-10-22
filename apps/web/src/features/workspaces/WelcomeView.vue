<!--
  "Tiếp tục thiết lập" (design WS-06) at `/welcome`, signed-in only, for an account without a
  workspace: an info notice, "Tạo không gian" to `/workspaces/new` and a hint that joining an existing
  workspace needs an invitation. The workspace guard sends users who have a workspace to `/`.
  Differs from the design: none intended.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AuthLayout from '../auth/AuthLayout.vue';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();

function onCreate() {
  void router.push('/workspaces/new');
}
</script>

<template>
  <AuthLayout :title="t('workspaces.welcome.title')" :subtitle="t('workspaces.welcome.subtitle')">
    <div class="welcome">
      <AtsNotice data-testid="welcome-notice">{{ t('workspaces.welcome.notice') }}</AtsNotice>

      <AtsButton block data-testid="welcome-create" @click="onCreate">
        {{ t('workspaces.welcome.create') }}
      </AtsButton>

      <p class="welcome__hint" data-testid="welcome-invite-hint">
        {{ t('workspaces.welcome.inviteHint') }}
      </p>
    </div>
  </AuthLayout>
</template>

<style scoped>
/* WS-06: notice, button and hint 16 px apart. */
.welcome {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.welcome__hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
}
</style>
