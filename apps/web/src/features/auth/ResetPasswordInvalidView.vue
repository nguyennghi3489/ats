<!--
  Password reset link invalid (design REC-05) at `/reset-password/invalid`, where the API redirects a
  reset link that is expired, already used, replaced by a newer one or unknown (decisions §2). The
  reset page sends people here too when it has no token or the API refuses it. "Yêu cầu liên kết mới"
  opens the request form at `/forgot-password`.
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
  <AuthLayout
    :title="t('auth.resetPassword.invalid.title')"
    :subtitle="t('auth.resetPassword.invalid.subtitle')"
  >
    <div class="reset-invalid">
      <AtsNotice tone="error" data-testid="reset-password-invalid-notice">
        {{ t('auth.resetPassword.invalid.notice') }}
      </AtsNotice>
      <AtsButton
        block
        data-testid="reset-password-invalid-request"
        @click="router.push('/forgot-password')"
      >
        {{ t('auth.resetPassword.invalid.requestNew') }}
      </AtsButton>
    </div>

    <template #footer>
      <RouterLink
        to="/sign-in"
        class="reset-invalid__link"
        data-testid="reset-password-invalid-sign-in-link"
      >
        {{ t('auth.resetPassword.invalid.backToSignIn') }}
      </RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.reset-invalid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* REC-05 shows "Quay lại đăng nhập" in the muted footer text, not as an underlined link. */
.reset-invalid__link {
  border-radius: var(--radius-sm);
  color: inherit;
  text-decoration: none;
}

.reset-invalid__link:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

.reset-invalid__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* Mobile: a 44 px tap target for the footer link, same look. */
@media (max-width: 767px) {
  .reset-invalid__link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target-min);
  }
}
</style>
