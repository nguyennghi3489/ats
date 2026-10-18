/**
 * vue-i18n setup (Composition API mode). Components use `useI18n()`; code outside components uses
 * `i18n.global` or the helpers in `format.ts` and `errors.ts`.
 *
 * The English copy is a first draft and needs human review (decisions §17).
 */
import { createI18n } from 'vue-i18n';
import { DEFAULT_LOCALE, detectLocale, type Locale, storeLocale } from './locale';
import en from './locales/en.json';
import vi from './locales/vi.json';

export type { Locale } from './locale';
export { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from './locale';

export type MessageSchema = typeof vi;

const initialLocale = detectLocale();

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { vi, en },
});

function applyDocumentLang(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

applyDocumentLang(initialLocale);

export type LocaleChangeListener = (locale: Locale) => void;

const listeners = new Set<LocaleChangeListener>();

export function getLocale(): Locale {
  return i18n.global.locale.value;
}

/**
 * Switches the app language: updates vue-i18n, `<html lang>` and this device's stored choice, then
 * tells listeners (for example, saving the choice on the user's account).
 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  applyDocumentLang(locale);
  storeLocale(locale);
  for (const listener of listeners) listener(locale);
}

/** Registers a listener for `setLocale` calls. Returns a function that removes it. */
export function onLocaleChange(listener: LocaleChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
