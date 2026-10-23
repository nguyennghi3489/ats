<!--
  Personal settings at `/settings/personal` (decisions §12, §13): the user's display name, interface
  language and theme. No design screen exists; the layout follows the foundation form composition
  ("01 · Foundations", form-composition): one column at most 560 px wide, a heading per section.
  - Hồ sơ: the name (shared `displayNameSchema`, trimmed, 1–80) saved with Better Auth `updateUser`,
    then the session store is reloaded so the sidebar shows the new name. The email is read-only.
  - Ngôn ngữ: switches the UI at once and saves `locale` on the account; if saving fails, the previous
    language comes back with an error.
  - Giao diện: applied at once through `useTheme().setTheme`, saved on this device only.
  - Đổi mật khẩu: `ChangePasswordForm`, below the others; the `password` slot can replace it.
-->
<script setup lang="ts">
/* global document -- DOM global, which no-undef does not know in .vue files */
import { DISPLAY_NAME_MAX_LENGTH, displayNameSchema, type Locale } from '@ats/shared';
import { computed, nextTick, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsPageBody from '../../components/layout/AtsPageBody.vue';
import AtsPageHeader from '../../components/layout/AtsPageHeader.vue';
import AtsButton from '../../components/ui/AtsButton.vue';
import AtsNotice from '../../components/ui/AtsNotice.vue';
import AtsRadio from '../../components/ui/AtsRadio.vue';
import AtsRadioGroup from '../../components/ui/AtsRadioGroup.vue';
import AtsTextField from '../../components/ui/AtsTextField.vue';
import { getLocale, setLocale } from '../../i18n';
import { translateError } from '../../i18n/errors';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { parseThemePreference, useTheme } from '../../lib/theme';
import { authApi, unwrap } from '../auth/auth-client';
import { useSessionStore } from '../auth/session.store';
import ChangePasswordForm from './ChangePasswordForm.vue';

defineSlots<{
  /** The change-password section below the others; `ChangePasswordForm` by default. */
  password?: () => unknown;
}>();

const { t, te } = useI18n({ useScope: 'global' });
const session = useSessionStore();
const theme = useTheme();

const headingIds = { profile: useId(), language: useId(), theme: useId() };

// Profile

const nameId = useId();
const name = ref(session.user?.name ?? '');
const email = computed(() => session.user?.email ?? '');
/** Set by the first save; from then on the name is re-checked as the user types. */
const submitted = ref(false);
const savingName = ref(false);
const nameSaved = ref(false);
/** Code of the API's refusal of the name; cleared when the name changes. */
const nameApiError = ref<string | null>(null);

const localNameError = computed(() => {
  if (!submitted.value) return undefined;
  const result = displayNameSchema.safeParse(name.value);
  return result.success ? undefined : result.error.issues[0]?.message;
});

const nameError = computed(() => {
  const code = localNameError.value ?? nameApiError.value;
  if (!code) return undefined;
  const key = `settings.personal.profile.errors.${code}`;
  return te(key) ? t(key, { max: DISPLAY_NAME_MAX_LENGTH }) : translateError(code);
});

function onNameInput(value: string) {
  name.value = value;
  nameApiError.value = null;
  nameSaved.value = false;
}

async function focusName() {
  await nextTick();
  document.getElementById(nameId)?.focus();
}

async function onSaveName() {
  if (savingName.value) return;
  submitted.value = true;
  nameSaved.value = false;
  nameApiError.value = null;
  const parsed = displayNameSchema.safeParse(name.value);
  if (!parsed.success) {
    await focusName();
    return;
  }

  savingName.value = true;
  try {
    await unwrap(authApi.client.updateUser({ name: parsed.data }));
  } catch (error) {
    nameApiError.value = error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
    savingName.value = false;
    await focusName();
    return;
  }

  try {
    await session.load();
  } catch {
    // The name is saved; without a fresh session the sidebar still shows it from here.
    if (session.user) session.user = { ...session.user, name: parsed.data };
  }
  name.value = parsed.data;
  savingName.value = false;
  nameSaved.value = true;
}

// Language

const locale = computed(() => getLocale());
const savingLocale = ref(false);
const localeFailed = ref(false);

async function onLocaleChoice(value: string | undefined) {
  if (value !== 'vi' && value !== 'en') return;
  const previous = getLocale();
  if (value === previous || savingLocale.value) return;
  localeFailed.value = false;
  setLocale(value);
  savingLocale.value = true;
  try {
    await unwrap(authApi.client.updateUser({ locale: value }));
    if (session.user) session.user = { ...session.user, locale: value as Locale };
  } catch {
    setLocale(previous);
    localeFailed.value = true;
  } finally {
    savingLocale.value = false;
  }
}

// Theme

function onThemeChoice(value: string | undefined) {
  void theme.setTheme(parseThemePreference(value));
}
</script>

<template>
  <div class="personal-settings" data-testid="personal-settings">
    <AtsPageHeader :title="t('settings.personal.title')" />
    <AtsPageBody>
      <div class="personal-settings__column">
        <section
          class="personal-settings__section"
          :aria-labelledby="headingIds.profile"
          data-testid="personal-settings-profile-section"
        >
          <h2 :id="headingIds.profile" class="personal-settings__heading">
            {{ t('settings.personal.profile.heading') }}
          </h2>
          <form
            class="personal-settings__form"
            novalidate
            data-testid="personal-settings-profile"
            @submit.prevent="onSaveName"
          >
            <AtsTextField
              :id="nameId"
              :model-value="name"
              :label="t('settings.personal.profile.name')"
              :error="nameError"
              required
              :disabled="savingName"
              autocomplete="name"
              data-testid="personal-settings-name"
              @update:model-value="onNameInput"
            />
            <AtsTextField
              :model-value="email"
              type="email"
              readonly
              :label="t('settings.personal.profile.email')"
              :helper="t('settings.personal.profile.emailHelper')"
              data-testid="personal-settings-email"
            />
            <div class="personal-settings__actions">
              <AtsButton
                type="submit"
                :pending="savingName"
                data-testid="personal-settings-save-name"
              >
                {{ t('settings.personal.profile.save') }}
              </AtsButton>
            </div>
            <AtsNotice
              v-if="nameSaved"
              tone="success"
              data-testid="personal-settings-profile-saved"
            >
              {{ t('settings.personal.profile.saved') }}
            </AtsNotice>
          </form>
        </section>

        <section
          class="personal-settings__section"
          :aria-labelledby="headingIds.language"
          data-testid="personal-settings-language-section"
        >
          <h2 :id="headingIds.language" class="personal-settings__heading">
            {{ t('settings.personal.language.heading') }}
          </h2>
          <AtsRadioGroup
            :model-value="locale"
            name="personal-settings-locale"
            :legend="t('settings.personal.language.legend')"
            :disabled="savingLocale"
            :aria-busy="savingLocale ? 'true' : undefined"
            @update:model-value="onLocaleChoice"
          >
            <!-- Each language is named in itself, in both locales. -->
            <AtsRadio
              value="vi"
              :label="t('settings.personal.language.vi')"
              data-testid="personal-settings-locale-vi"
            />
            <AtsRadio
              value="en"
              :label="t('settings.personal.language.en')"
              data-testid="personal-settings-locale-en"
            />
          </AtsRadioGroup>
          <AtsNotice v-if="localeFailed" tone="error" data-testid="personal-settings-locale-error">
            {{ t('settings.personal.language.error') }}
          </AtsNotice>
        </section>

        <section
          class="personal-settings__section"
          :aria-labelledby="headingIds.theme"
          data-testid="personal-settings-theme-section"
        >
          <h2 :id="headingIds.theme" class="personal-settings__heading">
            {{ t('settings.personal.theme.heading') }}
          </h2>
          <AtsRadioGroup
            :model-value="theme.preference.value"
            name="personal-settings-theme"
            :legend="t('settings.personal.theme.legend')"
            @update:model-value="onThemeChoice"
          >
            <AtsRadio
              value="system"
              :label="t('settings.personal.theme.system')"
              data-testid="personal-settings-theme-system"
            />
            <AtsRadio
              value="light"
              :label="t('settings.personal.theme.light')"
              data-testid="personal-settings-theme-light"
            />
            <AtsRadio
              value="dark"
              :label="t('settings.personal.theme.dark')"
              data-testid="personal-settings-theme-dark"
            />
          </AtsRadioGroup>
          <p class="personal-settings__helper" data-testid="personal-settings-theme-helper">
            {{ t('settings.personal.theme.helper') }}
          </p>
        </section>

        <slot name="password"><ChangePasswordForm /></slot>
      </div>
    </AtsPageBody>
  </div>
</template>

<style scoped>
/* One column, at most 560 px wide (foundation form composition); sections 32 px apart. */
.personal-settings__column {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 560px;
  min-width: 0;
}

.personal-settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.personal-settings__heading {
  margin: 0;
  color: var(--color-ink);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-lg);
}

.personal-settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.personal-settings__actions {
  display: flex;
}

.personal-settings__helper {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

/* Mobile: the save button spans the column, as in the form composition. */
@media (max-width: 767px) {
  .personal-settings__actions > * {
    flex: 1;
  }
}
</style>
