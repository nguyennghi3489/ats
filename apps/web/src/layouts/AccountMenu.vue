<!--
  Account menu of the app shell (design page "02 · App shell", Example · Account menu open): the "..."
  trigger next to the user's name opens, upward from the sidebar footer (above its divider, on the
  sidebar content's start edge; outside the footer, above the trigger), the heading "Tài khoản cá
  nhân", the personal settings link, the theme group, the language group, and sign out.
  Differs from the design: the "Ngôn ngữ" group below "Giao diện" is added (decisions §12), in the
  same style.
  - Theme (decisions §13) is saved on this device only for now; choosing one applies it and closes
    the menu (the panel takes its theme when it opens).
  - Language switches the copy at once, then is saved on the account through Better Auth; if the save
    fails the previous language comes back and the error shows in the menu, which stays open.
  - Sign out ends the session on the server, then forgets every workspace's cached data (decisions
    §2: nothing of a workspace stays in memory on a shared device) and goes to sign-in. If the server
    call fails nothing changes and the error shows in the menu.
  The options are role="menuitemradio" with aria-checked, so AtsMenu's arrow keys reach them.
  `variant="compact"` is the trigger of the mobile top bar (ATS/App chrome/Mobile): a round avatar
  with the user's initials in a 44 px touch target; the same menu opens under it, at its end edge.
-->
<script setup lang="ts">
/* global Element, HTMLButtonElement, HTMLElement -- DOM types, which no-undef does not know in .vue files */
import { computed, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AtsIconButton from '../components/ui/AtsIconButton.vue';
import AtsMenu from '../components/ui/AtsMenu.vue';
import AtsMenuItem from '../components/ui/AtsMenuItem.vue';
import { authApi, unwrap } from '../features/auth/auth-client';
import { useSessionStore } from '../features/auth/session.store';
import { clearWorkspaceCache } from '../features/workspaces/workspace-cache';
import { type Locale, setLocale } from '../i18n';
import { type ThemePreference, useTheme } from '../lib/theme';

withDefaults(
  defineProps<{
    /** `sidebar`: the "..." in the sidebar footer. `compact`: the initials avatar of the top bar. */
    variant?: 'sidebar' | 'compact';
  }>(),
  { variant: 'sidebar' },
);

const PERSONAL_SETTINGS_PATH = '/settings/personal';
const SIGN_IN_PATH = '/sign-in';
/** The sidebar footer row (avatar, name, "..."): the panel opens above it, on its start edge. */
const FOOTER_ROW = '[data-testid="app-sidebar-user"]';

const { t, locale } = useI18n({ useScope: 'global' });
const session = useSessionStore();
const router = useRouter();
const theme = useTheme();
const themePreference = theme.preference;

const themeOptions = [
  { value: 'system', label: 'shell.accountMenu.themeSystem' },
  { value: 'light', label: 'shell.accountMenu.themeLight' },
  { value: 'dark', label: 'shell.accountMenu.themeDark' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

const localeOptions = [
  { value: 'vi', label: 'shell.accountMenu.languageVi' },
  { value: 'en', label: 'shell.accountMenu.languageEn' },
] as const satisfies ReadonlyArray<{ value: Locale; label: string }>;

type MenuError = 'languageFailed' | 'signOutFailed';

const busy = ref<'locale' | 'signOut' | null>(null);
const error = ref<MenuError | null>(null);
const root = useTemplateRef<HTMLElement>('root');

const triggerLabel = computed(() =>
  t('shell.accountMenu.trigger', { name: session.user?.name ?? '' }),
);

/** First letters of the first and last words, e.g. "Nguyễn Văn An" → "NA" (as in the sidebar). */
const initials = computed(() => {
  const words = (session.user?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const ends = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return ends.map((word) => [...(word ?? '')][0]?.toLocaleUpperCase() ?? '').join('');
});

/** The design opens the panel above the footer divider, lined up with the sidebar content. */
function footerRow(): Element | null {
  return root.value?.closest(FOOTER_ROW) ?? null;
}

function triggerButton(): HTMLButtonElement | null {
  return root.value?.querySelector('button') ?? null;
}

/** Closes the menu through its trigger, which also takes focus back. */
function closeMenu(): void {
  const trigger = triggerButton();
  if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
  trigger?.focus();
}

async function chooseTheme(preference: ThemePreference): Promise<void> {
  closeMenu();
  await theme.setTheme(preference);
}

async function chooseLocale(next: Locale): Promise<void> {
  if (busy.value || next === locale.value) return;
  const previous = locale.value as Locale;
  busy.value = 'locale';
  error.value = null;
  setLocale(next);
  try {
    await unwrap(authApi.client.updateUser({ locale: next }));
    if (session.user) session.user = { ...session.user, locale: next };
  } catch {
    setLocale(previous);
    error.value = 'languageFailed';
  } finally {
    busy.value = null;
  }
}

async function signOut(): Promise<void> {
  if (busy.value) return;
  busy.value = 'signOut';
  error.value = null;
  try {
    await session.signOut();
  } catch {
    error.value = 'signOutFailed';
    busy.value = null;
    return;
  }
  clearWorkspaceCache();
  busy.value = null;
  closeMenu();
  await router.push(SIGN_IN_PATH);
}
</script>

<template>
  <span ref="root" class="account-menu">
    <AtsMenu
      :placement="variant === 'compact' ? 'bottom-end' : 'top-start'"
      :anchor="variant === 'compact' ? undefined : footerRow"
    >
      <template #trigger="{ props: triggerProps }">
        <button
          v-if="variant === 'compact'"
          v-bind="triggerProps"
          type="button"
          class="account-menu__avatar-trigger"
          :aria-label="triggerLabel"
          :title="triggerLabel"
          data-testid="account-menu-trigger"
          @click="error = null"
          @keydown="error = null"
        >
          <span class="account-menu__avatar" aria-hidden="true" data-testid="account-menu-avatar">{{
            initials
          }}</span>
        </button>
        <AtsIconButton
          v-else
          v-bind="triggerProps"
          class="account-menu__trigger"
          icon="more"
          :label="triggerLabel"
          data-testid="account-menu-trigger"
          @click="error = null"
          @keydown="error = null"
        />
      </template>

      <p class="account-menu__heading" data-testid="account-menu-heading">
        {{ t('shell.accountMenu.heading') }}
      </p>
      <div class="account-menu__link">
        <AtsMenuItem
          :label="t('shell.accountMenu.personalSettings')"
          :to="PERSONAL_SETTINGS_PATH"
        />
      </div>

      <div class="account-menu__divider" role="separator" />

      <div class="account-menu__group" role="group" :aria-label="t('shell.accountMenu.theme')">
        <span class="account-menu__group-label" aria-hidden="true">{{
          t('shell.accountMenu.theme')
        }}</span>
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="account-menu__option"
          role="menuitemradio"
          tabindex="-1"
          :aria-checked="themePreference === option.value ? 'true' : 'false'"
          @click="chooseTheme(option.value)"
        >
          {{ t(option.label) }}
        </button>
      </div>

      <div class="account-menu__group" role="group" :aria-label="t('shell.accountMenu.language')">
        <span class="account-menu__group-label" aria-hidden="true">{{
          t('shell.accountMenu.language')
        }}</span>
        <button
          v-for="option in localeOptions"
          :key="option.value"
          type="button"
          class="account-menu__option"
          role="menuitemradio"
          tabindex="-1"
          :lang="option.value"
          :aria-checked="locale === option.value ? 'true' : 'false'"
          @click="chooseLocale(option.value)"
        >
          {{ t(option.label) }}
        </button>
      </div>

      <p v-if="error" class="account-menu__error" role="alert">
        {{ t(`shell.accountMenu.errors.${error}`) }}
      </p>

      <div class="account-menu__divider" role="separator" />

      <button
        type="button"
        class="account-menu__option account-menu__option--danger"
        role="menuitem"
        tabindex="-1"
        :aria-busy="busy === 'signOut' ? 'true' : undefined"
        @click="signOut"
      >
        {{ t('shell.accountMenu.signOut') }}
      </button>
    </AtsMenu>
  </span>
</template>

<style scoped>
/*
 * "Example · Account menu open": a compact panel; the heading in medium ink, the rows in the small
 * size 4 px apart, group labels muted, 1 px line dividers, sign out in the error colour. The check
 * sits before the chosen option and is drawn by CSS, so it is not part of the option's name.
 */
.account-menu {
  display: inline-flex;
}

/* The design draws the "..." without a frame, on the sidebar colour. */
.account-menu__trigger {
  border-color: transparent;
  background: transparent;
}

/*
 * Top bar avatar (ATS/App chrome/Mobile): a 32 px circle with a 1 px line border on the surface, the
 * initials in bold, centred in a frameless 44 px touch target.
 */
.account-menu__avatar-trigger {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  cursor: pointer;
}

.account-menu__avatar-trigger:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.account-menu__avatar {
  display: inline-flex;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-xs);
}

.account-menu__heading {
  margin: 0;
  padding-inline: var(--space-1);
  color: var(--color-ink);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-sm);
}

.account-menu__link :deep(.ats-menu-item),
.account-menu__option {
  min-height: 24px;
  padding-block: 2px;
  padding-inline: var(--space-1);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.account-menu__option {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  width: 100%;
  margin: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-regular);
  text-align: left;
  cursor: pointer;
}

.account-menu__option:hover,
.account-menu__option:focus {
  background: var(--color-accent);
  outline: none;
}

.account-menu__option:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}

.account-menu__option[aria-checked='true']::before {
  content: '✓' / '';
  margin-inline-end: var(--space-1);
}

.account-menu__option--danger {
  color: var(--color-danger);
}

.account-menu__option[aria-busy='true'] {
  cursor: progress;
}

.account-menu__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-menu__group + .account-menu__group {
  margin-block-start: var(--space-2);
}

.account-menu__group-label {
  padding-block-end: var(--space-1);
  padding-inline: var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

.account-menu__divider {
  margin-block: var(--space-1);
  border-block-start: 1px solid var(--color-line);
}

/* The error wraps inside the panel rather than widening it. */
.account-menu__error {
  contain: inline-size;
  margin: var(--space-1) 0 0;
  padding-inline: var(--space-1);
  color: var(--color-error-ink);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-xs);
}

@media (max-width: 767px) {
  .account-menu__link :deep(.ats-menu-item),
  .account-menu__option {
    min-height: var(--touch-target-min);
  }
}
</style>
