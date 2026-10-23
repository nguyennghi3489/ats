<!--
  "Đổi mật khẩu" on the personal settings page (decisions §13). No design screen exists; the section
  follows the other personal settings sections (heading, one column of fields, button below), and
  the "Hiện" toggles follow the reset-password form.
  - The new password is checked with the shared `passwordSchema`, so its messages are the sign-up
    ones; it must be typed twice. Fields are checked on submit, then again as the user types.
  - Better Auth `changePassword` with `revokeOtherSessions: true`: like a password reset (§2), every
    other session of the user is signed out; this one gets a fresh session cookie and stays.
  - A wrong current password (`INVALID_PASSWORD`) shows on "Mật khẩu hiện tại"; other failures show
    in an error notice. Success clears the fields and says other devices were signed out.
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { PASSWORD_ERROR_CODES, type PasswordErrorCode, passwordSchema } from '@ats/shared';
import { computed, nextTick, reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi, unwrap } from '../auth/auth-client';

type Field = 'current' | 'new' | 'confirm';

type FieldErrorCode =
  'CURRENT_PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | PasswordErrorCode | 'PASSWORD_MISMATCH';

/** Better Auth's code for a current password that does not match. */
const INVALID_PASSWORD = 'INVALID_PASSWORD';

const FIELDS: readonly Field[] = ['current', 'new', 'confirm'];

const { t } = useI18n({ useScope: 'global' });

const headingId = useId();
const ids: Record<Field, string> = { current: useId(), new: useId(), confirm: useId() };

const form = reactive<Record<Field, string>>({ current: '', new: '', confirm: '' });
const visible = reactive<Record<Field, boolean>>({ current: false, new: false, confirm: false });
/** Set by the first submit; from then on the fields are re-checked as the user types. */
const submitted = ref(false);
const pending = ref(false);
const done = ref(false);
/** Field codes from the API's refusal; each is cleared when its field changes. */
const apiErrors = reactive<Partial<Record<Field, FieldErrorCode>>>({});
/** Code of any other failed request (network, server), shown in the error notice. */
const requestError = ref<string | null>(null);

function isPasswordError(code: string): code is PasswordErrorCode {
  return (PASSWORD_ERROR_CODES as readonly string[]).includes(code);
}

/** The first problem with each field as typed; empty when the form can be sent. */
function localErrors(): Partial<Record<Field, FieldErrorCode>> {
  const errors: Partial<Record<Field, FieldErrorCode>> = {};
  if (form.current === '') errors.current = 'CURRENT_PASSWORD_REQUIRED';
  const result = passwordSchema.safeParse(form.new);
  if (!result.success) errors.new = result.error.issues[0]?.message as PasswordErrorCode;
  else if (form.confirm !== form.new) errors.confirm = 'PASSWORD_MISMATCH';
  return errors;
}

const errorCodes = computed<Partial<Record<Field, FieldErrorCode>>>(() => ({
  ...(submitted.value ? localErrors() : {}),
  ...apiErrors,
}));

function errorText(field: Field): string | undefined {
  const code = errorCodes.value[field];
  return code ? t(`settings.password.errors.${code}`) : undefined;
}

const labels: Record<Field, string> = {
  current: 'settings.password.current',
  new: 'settings.password.new',
  confirm: 'settings.password.confirm',
};

const toggleLabels: Record<Field, { show: string; hide: string }> = {
  current: { show: 'settings.password.showCurrent', hide: 'settings.password.hideCurrent' },
  new: { show: 'settings.password.showNew', hide: 'settings.password.hideNew' },
  confirm: { show: 'settings.password.showConfirm', hide: 'settings.password.hideConfirm' },
};

const autocomplete: Record<Field, string> = {
  current: 'current-password',
  new: 'new-password',
  confirm: 'new-password',
};

function toggleLabel(field: Field): string {
  return t(visible[field] ? toggleLabels[field].hide : toggleLabels[field].show);
}

function onInput(field: Field, value: string) {
  form[field] = value;
  delete apiErrors[field];
  done.value = false;
}

async function focusFirstError() {
  await nextTick();
  const field = FIELDS.find((f) => errorCodes.value[f]);
  if (field) document.getElementById(ids[field])?.focus();
}

async function onSubmit() {
  // Enter in a field submits the form too, so the busy button alone does not stop a second send.
  if (pending.value) return;
  submitted.value = true;
  done.value = false;
  requestError.value = null;
  for (const field of FIELDS) delete apiErrors[field];
  if (Object.keys(localErrors()).length > 0) {
    await focusFirstError();
    return;
  }

  pending.value = true;
  try {
    await unwrap(
      authApi.client.changePassword({
        currentPassword: form.current,
        newPassword: form.new,
        revokeOtherSessions: true,
      }),
    );
  } catch (error) {
    const code = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    pending.value = false;
    if (code === INVALID_PASSWORD) apiErrors.current = INVALID_PASSWORD;
    else if (isPasswordError(code)) apiErrors.new = code;
    else requestError.value = code;
    if (requestError.value === null) await focusFirstError();
    return;
  }

  pending.value = false;
  submitted.value = false;
  for (const field of FIELDS) {
    form[field] = '';
    visible[field] = false;
  }
  done.value = true;
}
</script>

<template>
  <section
    class="change-password"
    :aria-labelledby="headingId"
    data-testid="change-password-section"
  >
    <h2 :id="headingId" class="change-password__heading">
      {{ t('settings.password.heading') }}
    </h2>
    <form
      class="change-password__form"
      novalidate
      data-testid="change-password-form"
      @submit.prevent="onSubmit"
    >
      <div v-for="field in FIELDS" :key="field" class="change-password__password">
        <AtsTextField
          :id="ids[field]"
          :model-value="form[field]"
          class="change-password__field"
          :type="visible[field] ? 'text' : 'password'"
          :label="t(labels[field])"
          :helper="field === 'new' ? t('settings.password.newHelper') : undefined"
          :error="errorText(field)"
          required
          :disabled="pending"
          :autocomplete="autocomplete[field]"
          :data-testid="`change-password-${field}`"
          @update:model-value="onInput(field, $event)"
        />
        <button
          type="button"
          class="change-password__toggle"
          :disabled="pending"
          :aria-controls="ids[field]"
          :aria-label="toggleLabel(field)"
          :data-testid="`change-password-${field}-toggle`"
          @click="visible[field] = !visible[field]"
        >
          {{ visible[field] ? t('settings.password.hide') : t('settings.password.show') }}
        </button>
      </div>

      <div class="change-password__actions">
        <AtsButton
          type="submit"
          :disabled="pending"
          :pending="pending"
          data-testid="change-password-submit"
        >
          {{ pending ? t('settings.password.submitting') : t('settings.password.submit') }}
        </AtsButton>
      </div>

      <AtsNotice v-if="done" tone="success" data-testid="change-password-done">
        {{ t('settings.password.changed') }}
      </AtsNotice>
      <AtsNotice v-if="requestError" tone="error" data-testid="change-password-error">
        {{ translateError(requestError) }}
      </AtsNotice>
    </form>
  </section>
</template>

<style scoped>
/* Same spacing as the other personal settings sections. */
.change-password,
.change-password__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.change-password__heading {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-lg);
}

/* The "Hiện" text button sits under the helper or error text, as on the reset-password form. */
.change-password__password {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
}

.change-password__field {
  align-self: stretch;
}

.change-password__toggle {
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

.change-password__toggle:hover:not(:disabled) {
  text-decoration: underline;
}

.change-password__toggle:disabled {
  cursor: default;
  opacity: 0.6;
}

.change-password__toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.change-password__actions {
  display: flex;
}

/* Mobile: the button spans the column and the toggles get a 44 px tap target. */
@media (max-width: 767px) {
  .change-password__actions > * {
    flex: 1;
  }

  .change-password__toggle {
    min-height: var(--touch-target-min);
  }
}
</style>
