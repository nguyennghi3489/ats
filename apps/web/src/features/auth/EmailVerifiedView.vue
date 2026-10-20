<!--
  Email verified (design AUTH-05) at `/verify-email/success`, where the API redirects a valid
  verification link (decisions §2). The user is not signed in here; "Đăng nhập" leads to `/sign-in`.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AuthLayout from './AuthLayout.vue';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();
</script>

<template>
  <AuthLayout :title="t('auth.verified.title')" :subtitle="t('auth.verified.subtitle')">
    <div class="email-verified">
      <AtsNotice tone="success" data-testid="verified-notice">
        {{ t('auth.verified.notice') }}
      </AtsNotice>
      <AtsButton block data-testid="verified-sign-in" @click="router.push('/sign-in')">
        {{ t('auth.verified.signIn') }}
      </AtsButton>
    </div>
  </AuthLayout>
</template>

<style scoped>
.email-verified {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
