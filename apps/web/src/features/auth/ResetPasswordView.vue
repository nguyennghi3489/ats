<!--
  Set a new password (design REC-03) at `/reset-password?token=…`, where the API redirects a reset
  link that can still be used (decisions §2). The new password is checked with the shared
  `passwordSchema` and must be typed twice; the button stays disabled until both are valid and match.
  The token and password go to Better Auth `resetPassword`; on success the page shows the REC-04
  confirmation with "Đăng nhập". A token the API refuses (expired, used, unknown) opens the invalid
  page (REC-05), like a link without a token does (see the route's `beforeEnter`).
  The "Hiện" toggles follow the sign-up password field.
-->
<script setup lang="ts">
import {
  PASSWORD_ERROR_CODES,
  type PasswordErrorCode,
  RESET_PASSWORD_INVALID_PATH,
  RESET_PASSWORD_INVALID_TOKEN,
  passwordSchema,
} from '@ats/shared';
import { computed, reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { emailQuery, tokenQuery } from '../../router';
import { authApi, unwrap } from './auth-client';
import AuthLayout from './AuthLayout.vue';

type Field = 'password' | 'confirm';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

const token = tokenQuery(route.query) ?? '';
const email = emailQuery(route.query);
const ids: Record<Field, string> = { password: useId(), confirm: useId() };

const form = reactive<Record<Field, string>>({ password: '', confirm: '' });
/** Fields the user has left once; their errors show from then on. */
const touched = reactive<Record<Field, boolean>>({ password: false, confirm: false });
const visible = reactive<Record<Field, boolean>>({ password: false, confirm: false });
const pending = ref(false);
const done = ref(false);
/** Code of a failed request (network, server), shown translated in the error notice. */
const requestError = ref<string | null>(null);

const passwordCode = computed<PasswordErrorCode | null>(() => {
  const result = passwordSchema.safeParse(form.password);
  return result.success ? null : (result.error.issues[0]?.message as PasswordErrorCode);
});
const matches = computed(() => form.confirm === form.password);
const valid = computed(() => !passwordCode.value && form.confirm !== '' && matches.value);

/** Shown once the password was left, or once the user moved on to the second field. */
const passwordError = computed(() => {
  const code = passwordCode.value;
  if (!code || form.password === '' || !(touched.password || form.confirm !== '')) return undefined;
  return t(`auth.resetPassword.errors.${code}`);
});

/** Shown once the second field was left, or as soon as it is as long as the first one. */
const confirmError = computed(() => {
  if (form.confirm === '' || matches.value) return undefined;
  if (!touched.confirm && form.confirm.length < form.password.length) return undefined;
  return t('auth.resetPassword.errors.PASSWORD_MISMATCH');
});

function isPasswordError(code: string): code is PasswordErrorCode {
  return (PASSWORD_ERROR_CODES as readonly string[]).includes(code);
}

const requestErrorText = computed(() => {
  const code = requestError.value;
  if (!code) return null;
  return isPasswordError(code) ? t(`auth.resetPassword.errors.${code}`) : translateError(code);
});

const toggleLabels: Record<Field, { show: string; hide: string }> = {
  password: {
    show: 'auth.resetPassword.showNewPassword',
    hide: 'auth.resetPassword.hideNewPassword',
  },
  confirm: {
    show: 'auth.resetPassword.showConfirmPassword',
    hide: 'auth.resetPassword.hideConfirmPassword',
  },
};

function toggleLabel(field: Field): string {
  return t(visible[field] ? toggleLabels[field].hide : toggleLabels[field].show);
}

async function onSubmit() {
  // Enter in a field submits the form too, so the disabled or pending button alone does not stop it.
  if (pending.value || !valid.value) return;
  requestError.value = null;
  pending.value = true;
  try {
    await unwrap(authApi.client.resetPassword({ newPassword: form.password, token }));
  } catch (error) {
    const code = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    if (code === RESET_PASSWORD_INVALID_TOKEN) {
      await router.replace(RESET_PASSWORD_INVALID_PATH);
      return;
    }
    requestError.value = code;
    pending.value = false;
    return;
  }
  pending.value = false;
  done.value = true;
}

function goToSignIn() {
  void router.push({ path: '/sign-in', query: email ? { email } : {} });
}
</script>

<template>
  <AuthLayout
    v-if="done"
    :title="t('auth.resetPassword.done.title')"
    :subtitle="t('auth.resetPassword.done.subtitle')"
  >
    <div class="reset-password">
      <AtsNotice tone="success" data-testid="reset-password-done-notice">
        {{ t('auth.resetPassword.done.notice') }}
      </AtsNotice>
      <AtsButton block data-testid="reset-password-sign-in" @click="goToSignIn">
        {{ t('auth.resetPassword.done.signIn') }}
      </AtsButton>
    </div>
  </AuthLayout>

  <AuthLayout
    v-else
    :title="t('auth.resetPassword.title')"
    :subtitle="t('auth.resetPassword.subtitle')"
  >
    <form
      class="reset-password"
      novalidate
      data-testid="reset-password-form"
      @submit.prevent="onSubmit"
    >
      <div class="reset-password__password">
        <AtsTextField
          :id="ids.password"
          v-model="form.password"
          class="reset-password__field"
          :type="visible.password ? 'text' : 'password'"
          :label="t('auth.resetPassword.newPassword')"
          :helper="t('auth.resetPassword.passwordHelper')"
          :error="passwordError"
          :disabled="pending"
          autocomplete="new-password"
          data-testid="reset-password-new"
          @blur="touched.password = true"
        />
        <button
          type="button"
          class="reset-password__toggle"
          :disabled="pending"
          :aria-controls="ids.password"
          :aria-label="toggleLabel('password')"
          data-testid="reset-password-new-toggle"
          @click="visible.password = !visible.password"
        >
          {{ visible.password ? t('auth.resetPassword.hide') : t('auth.resetPassword.show') }}
        </button>
      </div>

      <div class="reset-password__password">
        <AtsTextField
          :id="ids.confirm"
          v-model="form.confirm"
          class="reset-password__field"
          :type="visible.confirm ? 'text' : 'password'"
          :label="t('auth.resetPassword.confirmPassword')"
          :error="confirmError"
          :disabled="pending"
          autocomplete="new-password"
          data-testid="reset-password-confirm"
          @blur="touched.confirm = true"
        />
        <button
          type="button"
          class="reset-password__toggle"
          :disabled="pending"
          :aria-controls="ids.confirm"
          :aria-label="toggleLabel('confirm')"
          data-testid="reset-password-confirm-toggle"
          @click="visible.confirm = !visible.confirm"
        >
          {{ visible.confirm ? t('auth.resetPassword.hide') : t('auth.resetPassword.show') }}
        </button>
      </div>

      <AtsButton
        type="submit"
        block
        :disabled="!valid && !pending"
        :pending="pending"
        data-testid="reset-password-submit"
      >
        {{ t('auth.resetPassword.submit') }}
      </AtsButton>

      <AtsNotice v-if="requestErrorText" tone="error" data-testid="reset-password-error">
        {{ requestErrorText }}
      </AtsNotice>
    </form>
  </AuthLayout>
</template>

<style scoped>
.reset-password {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* The "Hiện" text button sits under the helper or error text, as in REC-03. */
.reset-password__password {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.reset-password__field {
  align-self: stretch;
}

.reset-password__toggle {
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

.reset-password__toggle:hover:not(:disabled) {
  text-decoration: underline;
}

.reset-password__toggle:disabled {
  cursor: default;
  opacity: 0.6;
}

.reset-password__toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

/* Mobile: a 44 px tap target, same look. */
@media (max-width: 767px) {
  .reset-password__toggle {
    min-height: var(--touch-target-min);
  }
}
</style>
