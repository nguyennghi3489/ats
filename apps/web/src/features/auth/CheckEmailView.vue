<!--
  Check-email page after sign-up (design AUTH-03 "Kiểm tra email", and AUTH-04 "Đã gửi lại email"
  once a resend succeeded). Shows the address from `?email=` read-only and lets the user resend the
  verification link (decisions §2): the button is disabled 60 s after each send, the sign-up included.
  Differs from the design: the disabled button shows the countdown ("Gửi lại sau 45 giây").
  Screen readers hear the wait once when it starts and again when resend is ready, not every second.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { emailQuery } from '../../router';
import { authApi, unwrap } from './auth-client';
import AuthLayout from './AuthLayout.vue';
import { RESEND_COOLDOWN_SECONDS, useResendCountdown } from './useResendCountdown';

/** API codes for a refused resend (decisions §2); both carry `retryAfterSeconds`. */
const RESEND_TOO_SOON = 'RESEND_TOO_SOON';
const RESEND_LIMIT = 'RESEND_LIMIT';

type Announcement = { key: 'waitAnnouncement'; seconds: number } | { key: 'readyAnnouncement' };

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();

// The route sends a visit without an address to /sign-up, so it is always set here.
const email = computed(() => emailQuery(route.query) ?? '');

const countdown = useResendCountdown();
/** True after a resend succeeded: the page shows the AUTH-04 copy. */
const resent = ref(false);
/** True after RESEND_LIMIT: no more sends from this page. */
const limited = ref(false);
const pending = ref(false);
const error = ref<ApiError>();
/** What the polite live region says; changes only when a wait starts or ends. */
const announcement = ref<Announcement>();

function startWait(seconds: number) {
  countdown.start(seconds);
  if (countdown.running.value) {
    announcement.value = { key: 'waitAnnouncement', seconds: countdown.remaining.value };
  }
}

watch(countdown.running, (running, wasRunning) => {
  if (!running && wasRunning && !limited.value) announcement.value = { key: 'readyAnnouncement' };
});

onMounted(() => startWait(RESEND_COOLDOWN_SECONDS));

const announcementText = computed(() => {
  const value = announcement.value;
  if (!value) return '';
  return value.key === 'waitAnnouncement'
    ? t('auth.checkEmail.waitAnnouncement', { seconds: value.seconds })
    : t('auth.checkEmail.readyAnnouncement');
});

const buttonLabel = computed(() => {
  if (countdown.running.value) {
    return t('auth.checkEmail.resendIn', { seconds: countdown.remaining.value });
  }
  return resent.value ? t('auth.checkEmail.resendAgain') : t('auth.checkEmail.resend');
});

function retryAfterOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const seconds = (value as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : undefined;
}

async function resend() {
  if (pending.value || countdown.running.value || limited.value) return;
  pending.value = true;
  error.value = undefined;
  // `unwrap` keeps only the code; the wait is read from the same error body on the way through.
  let retryAfterSeconds: number | undefined;
  try {
    await unwrap(
      authApi.client.sendVerificationEmail({ email: email.value }).then((result) => {
        retryAfterSeconds = retryAfterOf(result.error);
        return result;
      }),
    );
    resent.value = true;
    startWait(RESEND_COOLDOWN_SECONDS);
  } catch (cause) {
    const failure =
      cause instanceof ApiError
        ? cause
        : new ApiError(CLIENT_ERROR_CODES.unknown, 0, undefined, { cause });
    error.value = failure;
    if (failure.code === RESEND_LIMIT) {
      limited.value = true;
      countdown.stop();
      announcement.value = undefined;
    } else if (failure.code === RESEND_TOO_SOON) {
      startWait(retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
    }
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <AuthLayout
    :title="resent ? t('auth.checkEmail.resentTitle') : t('auth.checkEmail.title')"
    :subtitle="resent ? t('auth.checkEmail.resentSubtitle') : t('auth.checkEmail.subtitle')"
  >
    <div class="check-email">
      <AtsTextField
        :model-value="email"
        :label="t('auth.checkEmail.recipient')"
        type="email"
        readonly
        data-testid="check-email-address"
      />

      <AtsNotice v-if="error" tone="error" data-testid="check-email-notice">
        {{ error.translate() }}
      </AtsNotice>
      <AtsNotice v-else-if="resent" tone="success" data-testid="check-email-notice">
        {{ t('auth.checkEmail.resentNotice') }}
      </AtsNotice>
      <AtsNotice v-else tone="info" data-testid="check-email-notice">
        {{ t('auth.checkEmail.notice') }}
      </AtsNotice>

      <AtsButton
        variant="outline"
        block
        :disabled="countdown.running.value || limited"
        :pending="pending"
        data-testid="check-email-resend"
        @click="resend"
      >
        {{ buttonLabel }}
      </AtsButton>

      <p class="check-email__live" aria-live="polite" data-testid="check-email-countdown-status">
        {{ announcementText }}
      </p>
    </div>

    <template #footer>
      <p v-if="resent">{{ t('auth.checkEmail.resentFooter') }}</p>
      <p v-else>
        {{ t('auth.checkEmail.wrongEmail') }}
        <RouterLink to="/sign-up" class="check-email__link">
          {{ t('auth.checkEmail.backToSignUp') }}
        </RouterLink>
      </p>
    </template>
  </AuthLayout>
</template>

<style scoped>
.check-email {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.check-email__link {
  color: inherit;
}

/* Read by screen readers only. */
.check-email__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
