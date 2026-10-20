<!--
  Sign-in (design SIGN-01 form, SIGN-02 signing in, SIGN-03 cannot sign in, SIGN-04 mobile) at
  `/sign-in`. Email and password go to Better Auth; on success the session store asks the API who is
  signed in and the user goes to the safe `redirect` query or `/` (decisions §2).
  Differs from the design: no Google / Microsoft / passkey buttons and no "hoặc" divider (disabled
  providers are hidden, decisions §2); an info notice when the session expired (`expired=1`); and error
  notices for an unverified email (with a link to resend) and for too many failed sign-ins.
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { SIGN_IN_RATE_LIMITED, signInRateLimitedErrorSchema } from '@ats/shared';
import { computed, nextTick, reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi } from './auth-client';
import AuthLayout from './AuthLayout.vue';
import { safeRedirect } from './redirect';
import { useSessionStore } from './session.store';

type Field = 'email' | 'password';
type FieldError = 'EMAIL_REQUIRED' | 'PASSWORD_REQUIRED';

/** Why the last attempt failed; `null` before any attempt and while one is running. */
type Failure =
  | { kind: 'credentials' }
  | { kind: 'unverified'; email: string }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  | { kind: 'other'; code: string };

/** Better Auth's code for a wrong email or password, and the app's own name for it. */
const CREDENTIAL_CODES = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_CREDENTIALS']);
const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const fields: Field[] = ['email', 'password'];
const ids: Record<Field, string> = { email: useId(), password: useId() };

const form = reactive<Record<Field, string>>({ email: '', password: '' });
const showPassword = ref(false);
const pending = ref(false);
/** Set by a submit with an empty field; from then on the fields are re-checked as the user types. */
const checking = ref(false);
/** Set by the first attempt; the session-expired notice has done its job by then. */
const attempted = ref(false);
const failure = ref<Failure | null>(null);

const expired = computed(() => !attempted.value && route.query.expired === '1');

const errors = computed<Partial<Record<Field, FieldError>>>(() => {
  if (!checking.value) return {};
  const result: Partial<Record<Field, FieldError>> = {};
  if (form.email.trim() === '') result.email = 'EMAIL_REQUIRED';
  if (form.password === '') result.password = 'PASSWORD_REQUIRED';
  return result;
});

function fieldError(field: Field): string | undefined {
  const code = errors.value[field];
  return code ? t(`auth.signIn.errors.${code}`) : undefined;
}

/** "Quên mật khẩu?" carries the typed email, so the forgot-password page opens with it filled in. */
const forgotPasswordLink = computed(() => {
  const email = form.email.trim();
  return { path: '/forgot-password', query: email === '' ? {} : { email } };
});

const credentialsFailed = computed(() => failure.value?.kind === 'credentials');

const title = computed(() => {
  if (pending.value) return t('auth.signIn.pendingTitle');
  if (credentialsFailed.value) return t('auth.signIn.failedTitle');
  return t('auth.signIn.title');
});

const subtitle = computed(() => {
  if (pending.value) return t('auth.signIn.pendingSubtitle');
  if (credentialsFailed.value) return t('auth.signIn.failedSubtitle');
  return t('auth.signIn.subtitle');
});

const submitLabel = computed(() => {
  if (pending.value) return t('auth.signIn.submitPending');
  if (credentialsFailed.value) return t('auth.signIn.retry');
  return t('auth.signIn.submit');
});

/** Text of the error notice for the last failure. */
const failureText = computed(() => {
  const current = failure.value;
  if (!current) return null;
  switch (current.kind) {
    case 'credentials':
      return translateError('INVALID_CREDENTIALS');
    case 'unverified':
      return translateError(EMAIL_NOT_VERIFIED);
    case 'rate-limited': {
      if (current.retryAfterSeconds === undefined) return translateError(SIGN_IN_RATE_LIMITED);
      const minutes = Math.max(1, Math.ceil(current.retryAfterSeconds / 60));
      return t('auth.signIn.rateLimited', { count: minutes }, minutes);
    }
    default:
      return translateError(current.code);
  }
});

function toFailure(error: unknown, email: string): Failure {
  if (!(error instanceof ApiError)) return { kind: 'other', code: CLIENT_ERROR_CODES.unknown };
  if (CREDENTIAL_CODES.has(error.code)) return { kind: 'credentials' };
  if (error.code === EMAIL_NOT_VERIFIED) return { kind: 'unverified', email };
  if (error.code === SIGN_IN_RATE_LIMITED) {
    const body = signInRateLimitedErrorSchema.safeParse(error.cause);
    return {
      kind: 'rate-limited',
      retryAfterSeconds: body.success ? body.data.retryAfterSeconds : undefined,
    };
  }
  return { kind: 'other', code: error.code };
}

async function focus(field: Field) {
  await nextTick();
  document.getElementById(ids[field])?.focus();
}

async function onSubmit() {
  // Enter in a field submits the form too, so the pending button alone does not block a resend.
  if (pending.value) return;
  checking.value = true;
  const firstEmpty = fields.find((field) => errors.value[field]);
  if (firstEmpty) {
    await focus(firstEmpty);
    return;
  }

  checking.value = false;
  attempted.value = true;
  failure.value = null;
  pending.value = true;
  const email = form.email.trim();
  try {
    await authApi.signIn({ email, password: form.password });
    await session.load();
  } catch (error) {
    failure.value = toFailure(error, email);
    pending.value = false;
    if (failure.value.kind === 'credentials') {
      form.password = '';
      await focus('password');
    }
    return;
  }
  await router.push(safeRedirect(route.query.redirect));
  pending.value = false;
}
</script>

<template>
  <AuthLayout
    class="sign-in-layout"
    :class="{ 'sign-in-layout--idle': !pending && !failure }"
    :title="title"
    :subtitle="subtitle"
  >
    <form class="sign-in" novalidate data-testid="sign-in-form" @submit.prevent="onSubmit">
      <AtsNotice v-if="expired" tone="info" data-testid="sign-in-expired">
        {{ t('auth.signIn.expired') }}
      </AtsNotice>

      <AtsNotice v-if="failureText" tone="error" data-testid="sign-in-error">
        {{ failureText }}
        <RouterLink
          v-if="failure?.kind === 'unverified'"
          :to="{ path: '/verify-email', query: { email: failure.email } }"
          class="sign-in__notice-link"
          data-testid="sign-in-verify-link"
        >
          {{ t('auth.signIn.resendVerification') }}
        </RouterLink>
      </AtsNotice>

      <AtsTextField
        :id="ids.email"
        v-model="form.email"
        type="email"
        :label="t('auth.signIn.email')"
        :error="fieldError('email')"
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        data-testid="sign-in-email"
      />
      <div class="sign-in__password">
        <AtsTextField
          :id="ids.password"
          v-model="form.password"
          class="sign-in__password-field"
          :type="showPassword ? 'text' : 'password'"
          :label="t('auth.signIn.password')"
          :error="fieldError('password')"
          autocomplete="current-password"
          data-testid="sign-in-password"
        />
        <button
          type="button"
          class="sign-in__toggle"
          :aria-controls="ids.password"
          :aria-label="showPassword ? t('auth.signIn.hidePassword') : t('auth.signIn.showPassword')"
          data-testid="sign-in-password-toggle"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? t('auth.signIn.hide') : t('auth.signIn.show') }}
        </button>
      </div>

      <AtsButton type="submit" block :pending="pending" data-testid="sign-in-submit">
        {{ submitLabel }}
      </AtsButton>

      <AtsNotice v-if="pending" tone="info" data-testid="sign-in-pending">
        {{ t('auth.signIn.pendingNotice') }}
      </AtsNotice>
    </form>

    <template #footer>
      <div class="sign-in__footer">
        <RouterLink
          :to="forgotPasswordLink"
          class="sign-in__link"
          data-testid="sign-in-forgot-link"
        >
          {{ t('auth.signIn.forgotPassword') }}
        </RouterLink>
        <span class="sign-in__separator" aria-hidden="true"> · </span>
        <span>
          {{ t('auth.signIn.noAccount') }}
          <RouterLink to="/sign-up" class="sign-in__link" data-testid="sign-in-sign-up-link">
            {{ t('auth.signIn.signUp') }}
          </RouterLink>
        </span>
      </div>
    </template>
  </AuthLayout>
</template>

<style scoped>
.sign-in {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* The "Hiện" text button sits under the password, as in SIGN-01. */
.sign-in__password {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.sign-in__password-field {
  align-self: stretch;
}

.sign-in__toggle {
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

.sign-in__toggle:hover {
  text-decoration: underline;
}

.sign-in__toggle:focus-visible,
.sign-in__link:focus-visible,
.sign-in__notice-link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.sign-in__notice-link {
  color: inherit;
  font-weight: var(--font-weight-medium);
}

.sign-in__footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
}

.sign-in__link {
  color: var(--color-ink);
}

/*
 * Mobile (SIGN-04): no subtitle on the plain form, 44 px tap targets for "Hiện" and the footer links,
 * which sit at either end of the row.
 */
@media (max-width: 767px) {
  .sign-in-layout--idle :deep(.auth-layout__subtitle) {
    display: none;
  }

  .sign-in__toggle {
    min-height: var(--touch-target-min);
  }

  .sign-in__footer {
    justify-content: space-between;
  }

  .sign-in__separator {
    display: none;
  }

  .sign-in__link {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target-min);
  }
}
</style>
