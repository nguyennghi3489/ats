<!--
  Forgot password (design REC-01 request form, REC-02 check email) at `/forgot-password`. The user
  enters an email (prefilled from an `email` query, as sign-in passes it) and the API emails a reset
  link if the address has an account. The API answers every address the same way, so the page always
  switches to "Kiểm tra email" and never shows the address or whether an account exists (decisions §2).
  Differs from the design: REC-06 repeats REC-01 and is not built separately; REC-02 adds a "Gửi lại"
  text button, disabled with a countdown for 60 s after each send (the resend rule in decisions §2).
-->
<script setup lang="ts">
/* global document, setInterval, clearInterval -- DOM globals, which no-undef does not know in .vue files */
import {
  RESEND_ERROR_CODES,
  type ResendErrorCode,
  resendErrorSchema,
  signUpFormSchema,
} from '@ats/shared';
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi } from './auth-client';
import AuthLayout from './AuthLayout.vue';

/** "Gửi lại" stays disabled this long after each send (decisions §2). */
const RESEND_COOLDOWN_SECONDS = 60;

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

const emailId = useId();
const queryEmail = route.query.email;
const email = ref(typeof queryEmail === 'string' ? queryEmail : '');
const pending = ref(false);
/** Set by the first submit; from then on the address is re-checked as the user types. */
const submitted = ref(false);
/** The address the API accepted; set once the page shows the check-email state. */
const sentTo = ref<string | null>(null);
/** Code of a failed request (limits, network, server), shown translated in the error notice. */
const requestError = ref<string | null>(null);

const emailSchema = signUpFormSchema.shape.email;
const emailError = computed(() =>
  submitted.value && !emailSchema.safeParse(email.value).success
    ? t('auth.forgotPassword.errors.EMAIL_INVALID')
    : undefined,
);

function isResendError(code: string): code is ResendErrorCode {
  return (RESEND_ERROR_CODES as readonly string[]).includes(code);
}

const requestErrorText = computed(() => {
  const code = requestError.value;
  if (!code) return null;
  return isResendError(code) ? t(`auth.forgotPassword.errors.${code}`) : translateError(code);
});

// Resend countdown: the time a resend is allowed again, and a clock ticking each second until then.
const resendAt = ref(0);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const secondsLeft = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1_000)));

function stopTicker() {
  if (ticker !== undefined) clearInterval(ticker);
  ticker = undefined;
}

function startCountdown(seconds: number) {
  stopTicker();
  now.value = Date.now();
  resendAt.value = now.value + seconds * 1_000;
  ticker = setInterval(() => {
    now.value = Date.now();
    if (secondsLeft.value === 0) stopTicker();
  }, 1_000);
}

onBeforeUnmount(stopTicker);

const resendLabel = computed(() =>
  secondsLeft.value > 0
    ? t('auth.forgotPassword.resendIn', { count: secondsLeft.value }, secondsLeft.value)
    : t('auth.forgotPassword.resend'),
);

/** Sends the reset request; returns whether the API accepted it. */
async function send(address: string): Promise<boolean> {
  requestError.value = null;
  pending.value = true;
  try {
    await authApi.requestPasswordReset({ email: address });
    return true;
  } catch (error) {
    requestError.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    // A send too soon waits as long as the API says before "Gửi lại" works again.
    if (error instanceof ApiError && error.code === 'RESEND_TOO_SOON') {
      const body = resendErrorSchema.safeParse(error.cause);
      if (body.success) startCountdown(body.data.retryAfterSeconds);
    }
    return false;
  } finally {
    pending.value = false;
  }
}

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
  if (await send(address)) {
    sentTo.value = address;
    startCountdown(RESEND_COOLDOWN_SECONDS);
  }
}

async function onResend() {
  if (pending.value || secondsLeft.value > 0 || sentTo.value === null) return;
  if (await send(sentTo.value)) startCountdown(RESEND_COOLDOWN_SECONDS);
}

function backToSignIn() {
  void router.push('/sign-in');
}
</script>

<template>
  <AuthLayout
    v-if="sentTo === null"
    :title="t('auth.forgotPassword.title')"
    :subtitle="t('auth.forgotPassword.subtitle')"
  >
    <form
      class="forgot-password"
      novalidate
      data-testid="forgot-password-form"
      @submit.prevent="onSubmit"
    >
      <AtsTextField
        :id="emailId"
        v-model="email"
        type="email"
        :label="t('auth.forgotPassword.email')"
        :error="emailError"
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        data-testid="forgot-password-email"
      />

      <AtsButton type="submit" block :pending="pending" data-testid="forgot-password-submit">
        {{ t('auth.forgotPassword.submit') }}
      </AtsButton>

      <AtsNotice v-if="requestErrorText" tone="error" data-testid="forgot-password-error">
        {{ requestErrorText }}
      </AtsNotice>
    </form>

    <template #footer>
      <RouterLink
        to="/sign-in"
        class="forgot-password__link"
        data-testid="forgot-password-sign-in-link"
      >
        {{ t('auth.forgotPassword.backToSignIn') }}
      </RouterLink>
    </template>
  </AuthLayout>

  <AuthLayout
    v-else
    :title="t('auth.forgotPassword.sentTitle')"
    :subtitle="t('auth.forgotPassword.sentSubtitle')"
  >
    <div class="forgot-password" data-testid="forgot-password-sent">
      <AtsNotice tone="info" data-testid="forgot-password-sent-notice">
        {{ t('auth.forgotPassword.sentNotice') }}
      </AtsNotice>

      <AtsButton block data-testid="forgot-password-back" @click="backToSignIn">
        {{ t('auth.forgotPassword.backToSignIn') }}
      </AtsButton>

      <button
        type="button"
        class="forgot-password__resend"
        :disabled="secondsLeft > 0 || pending"
        :aria-busy="pending ? 'true' : undefined"
        data-testid="forgot-password-resend"
        @click="onResend"
      >
        {{ resendLabel }}
      </button>

      <AtsNotice v-if="requestErrorText" tone="error" data-testid="forgot-password-error">
        {{ requestErrorText }}
      </AtsNotice>
    </div>
  </AuthLayout>
</template>

<style scoped>
.forgot-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* REC-01 shows "Quay lại đăng nhập" in the muted footer text, not as an underlined link. */
.forgot-password__link {
  border-radius: var(--radius-sm);
  color: inherit;
  text-decoration: none;
}

.forgot-password__link:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

/* "Gửi lại": a text button under the primary button, styled like the sign-in password toggle. */
.forgot-password__resend {
  align-self: flex-start;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-xs);
  cursor: pointer;
}

.forgot-password__resend:hover:enabled {
  text-decoration: underline;
}

.forgot-password__resend:disabled {
  color: var(--color-muted);
  cursor: not-allowed;
}

.forgot-password__link:focus-visible,
.forgot-password__resend:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* Mobile: 44 px tap targets for the footer link and "Gửi lại", same look. */
@media (max-width: 767px) {
  .forgot-password__link,
  .forgot-password__resend {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target-min);
  }
}
</style>
