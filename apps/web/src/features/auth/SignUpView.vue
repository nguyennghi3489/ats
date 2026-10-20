<!--
  Sign-up (design AUTH-01, validation errors AUTH-02) at `/sign-up`. Full name, email and password, checked
  with the shared `signUpFormSchema` before anything is sent; then the account is created through the auth
  client in the current interface language and the visitor goes to the check-email page.
  Differs from the design: no Google / Microsoft / passkey buttons and no "hoặc" divider (disabled
  providers are hidden, decisions §2), and a "Họ và tên" field above Email (#85, Better Auth needs a name).
  An email that already has an account is answered like a new one, so the form never reveals accounts.
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { type SignUpField, type SignUpFieldError, signUpFieldErrors } from '@ats/shared';
import { computed, nextTick, reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { getLocale } from '../../i18n';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi } from './auth-client';
import AuthLayout from './AuthLayout.vue';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();

const fields: SignUpField[] = ['name', 'email', 'password'];
const ids: Record<SignUpField, string> = { name: useId(), email: useId(), password: useId() };

const form = reactive<Record<SignUpField, string>>({ name: '', email: '', password: '' });
const showPassword = ref(false);
const pending = ref(false);
/** Set by the first submit; from then on the fields are re-checked as the visitor types. */
const submitted = ref(false);
/** Code of a failed request (network, server), shown translated in the error notice. */
const requestError = ref<string | null>(null);

const errors = computed<Partial<Record<SignUpField, SignUpFieldError>>>(() =>
  submitted.value ? signUpFieldErrors(form) : {},
);
const invalid = computed(() => Object.keys(errors.value).length > 0);

function fieldError(field: SignUpField): string | undefined {
  const code = errors.value[field];
  return code ? t(`auth.signUp.errors.${code}`) : undefined;
}

const noticeText = computed(() => {
  if (invalid.value) return t('auth.signUp.invalidNotice');
  if (requestError.value) return translateError(requestError.value);
  return null;
});

/** Better Auth's answer for a taken email when it does not hide it; treated like a new account. */
function isExistingAccount(error: unknown): boolean {
  return error instanceof ApiError && error.code.startsWith('USER_ALREADY_EXISTS');
}

async function focusFirstInvalid() {
  await nextTick();
  const first = fields.find((field) => errors.value[field]);
  if (first) document.getElementById(ids[first])?.focus();
}

async function onSubmit() {
  // Enter in a field submits the form too, so the pending button alone does not block a resend.
  if (pending.value) return;
  submitted.value = true;
  requestError.value = null;
  if (invalid.value) {
    await focusFirstInvalid();
    return;
  }

  const name = form.name.trim();
  const email = form.email.trim();
  pending.value = true;
  try {
    await authApi.signUp({ name, email, password: form.password, locale: getLocale() });
  } catch (error) {
    if (!isExistingAccount(error)) {
      requestError.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
      pending.value = false;
      return;
    }
  }
  await router.push({ path: '/verify-email', query: { email } });
  pending.value = false;
}
</script>

<template>
  <AuthLayout
    :title="t('auth.signUp.title')"
    :subtitle="invalid ? t('auth.signUp.subtitleInvalid') : t('auth.signUp.subtitle')"
  >
    <form class="sign-up" novalidate data-testid="sign-up-form" @submit.prevent="onSubmit">
      <AtsTextField
        :id="ids.name"
        v-model="form.name"
        :label="t('auth.signUp.name')"
        :error="fieldError('name')"
        autocomplete="name"
        data-testid="sign-up-name"
      />
      <AtsTextField
        :id="ids.email"
        v-model="form.email"
        type="email"
        :label="t('auth.signUp.email')"
        :error="fieldError('email')"
        autocomplete="email"
        autocapitalize="off"
        spellcheck="false"
        data-testid="sign-up-email"
      />
      <div class="sign-up__password">
        <AtsTextField
          :id="ids.password"
          v-model="form.password"
          class="sign-up__password-field"
          :type="showPassword ? 'text' : 'password'"
          :label="t('auth.signUp.password')"
          :helper="t('auth.signUp.passwordHelper')"
          :error="fieldError('password')"
          autocomplete="new-password"
          data-testid="sign-up-password"
        />
        <button
          type="button"
          class="sign-up__toggle"
          :aria-controls="ids.password"
          :aria-label="showPassword ? t('auth.signUp.hidePassword') : t('auth.signUp.showPassword')"
          data-testid="sign-up-password-toggle"
          @click="showPassword = !showPassword"
        >
          {{ showPassword ? t('auth.signUp.hide') : t('auth.signUp.show') }}
        </button>
      </div>

      <AtsButton type="submit" block :pending="pending" data-testid="sign-up-submit">
        {{ t('auth.signUp.submit') }}
      </AtsButton>

      <AtsNotice v-if="noticeText" tone="error" data-testid="sign-up-notice">
        {{ noticeText }}
      </AtsNotice>
    </form>

    <template #footer>
      {{ t('auth.signUp.haveAccount') }}
      <RouterLink to="/sign-in" class="sign-up__link" data-testid="sign-up-sign-in-link">
        {{ t('auth.signUp.signIn') }}
      </RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.sign-up {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* The "Hiện" text button sits under the helper or error text, as in AUTH-01 and AUTH-02. */
.sign-up__password {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.sign-up__password-field {
  align-self: stretch;
}

.sign-up__toggle {
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

.sign-up__toggle:hover {
  text-decoration: underline;
}

.sign-up__toggle:focus-visible,
.sign-up__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.sign-up__link {
  color: var(--color-ink);
}

/* Mobile: a 44 px tap target, same look. */
@media (max-width: 767px) {
  .sign-up__toggle {
    min-height: var(--touch-target-min);
  }
}
</style>
