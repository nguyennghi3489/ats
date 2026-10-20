<!--
  Verification link expired (design AUTH-06) at `/verify-email/expired`, where the API redirects a link
  that is expired, replaced by a newer one or unknown (decisions §2). The user asks for a new link and
  goes to the check-email page.
  Differs from the design: the recipient is an editable email field, not a read-only address, because
  the redirect does not carry the email; it is prefilled when an `email` query is present (#87).
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { RESEND_ERROR_CODES, type ResendErrorCode, signUpFormSchema } from '@ats/shared';
import { computed, nextTick, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi, unwrap } from './auth-client';
import AuthLayout from './AuthLayout.vue';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

const emailId = useId();
const queryEmail = route.query.email;
const email = ref(typeof queryEmail === 'string' ? queryEmail : '');
const pending = ref(false);
/** Set by the first submit; from then on the address is re-checked as the user types. */
const submitted = ref(false);
/** Code of a failed request (rate limit, network, server), shown translated in the error notice. */
const requestError = ref<string | null>(null);

const emailSchema = signUpFormSchema.shape.email;
const emailError = computed(() =>
  submitted.value && !emailSchema.safeParse(email.value).success
    ? t('auth.linkExpired.errors.EMAIL_INVALID')
    : undefined,
);

function isResendError(code: string): code is ResendErrorCode {
  return (RESEND_ERROR_CODES as readonly string[]).includes(code);
}

const requestErrorText = computed(() => {
  const code = requestError.value;
  if (!code) return null;
  return isResendError(code) ? t(`auth.linkExpired.errors.${code}`) : translateError(code);
});

async function onSubmit() {
  // Enter in the field submits the form too, so the pending button alone does not block a resend.
  if (pending.value) return;
  submitted.value = true;
  requestError.value = null;
  if (emailError.value) {
    await nextTick();
    document.getElementById(emailId)?.focus();
    return;
  }

  const address = email.value.trim();
  pending.value = true;
  try {
    await unwrap(authApi.client.sendVerificationEmail({ email: address }));
  } catch (error) {
    requestError.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    pending.value = false;
    return;
  }
  await router.push({ path: '/verify-email', query: { email: address } });
  pending.value = false;
}
</script>

<template>
  <AuthLayout :title="t('auth.linkExpired.title')" :subtitle="t('auth.linkExpired.subtitle')">
    <form
      class="link-expired"
      novalidate
      data-testid="link-expired-form"
      @submit.prevent="onSubmit"
    >
      <AtsNotice tone="error" data-testid="link-expired-notice">
        {{ t('auth.linkExpired.notice') }}
      </AtsNotice>

      <AtsTextField
        :id="emailId"
        v-model="email"
        type="email"
        :label="t('auth.linkExpired.email')"
        :placeholder="t('auth.linkExpired.emailPlaceholder')"
        :error="emailError"
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        data-testid="link-expired-email"
      />

      <AtsButton type="submit" block :pending="pending" data-testid="link-expired-submit">
        {{ t('auth.linkExpired.submit') }}
      </AtsButton>

      <AtsNotice v-if="requestErrorText" tone="error" data-testid="link-expired-request-error">
        {{ requestErrorText }}
      </AtsNotice>
    </form>

    <template #footer>
      <RouterLink to="/sign-in" class="link-expired__link" data-testid="link-expired-sign-in-link">
        {{ t('auth.linkExpired.backToSignIn') }}
      </RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.link-expired {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* AUTH-06 shows "Quay lại đăng nhập" in the muted footer text, not as an underlined link. */
.link-expired__link {
  border-radius: var(--radius-sm);
  color: inherit;
  text-decoration: none;
}

.link-expired__link:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

.link-expired__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* Mobile: a 44 px tap target for the footer link, same look. */
@media (max-width: 767px) {
  .link-expired__link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target-min);
  }
}
</style>
