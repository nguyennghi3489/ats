/**
 * Which language the app starts in (decisions §12): the user's stored choice, else the first vi/en
 * entry in the browser's language list, else Vietnamese.
 */

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'vi';

/** `localStorage` key holding the last language picked on this device. */
export const LOCALE_STORAGE_KEY = 'ats.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Maps a BCP 47 tag such as `en-US` or `vi` to a supported locale, or `undefined`. */
export function matchLocale(tag: string): Locale | undefined {
  const primary = tag.trim().toLowerCase().split('-')[0];
  return isLocale(primary) ? primary : undefined;
}

export interface LocaleSources {
  /** Value read from `localStorage`, or `null` when nothing is stored. */
  stored: string | null;
  /** Browser preference list, most preferred first (`navigator.languages`). */
  languages: readonly string[];
}

export function resolveLocale({ stored, languages }: LocaleSources): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of languages) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    // Storage can be disabled (privacy mode, sandboxed frames); fall through to the browser language.
    return null;
  }
}

function browserLanguages(): readonly string[] {
  const nav = globalThis.navigator;
  if (!nav) return [];
  if (nav.languages?.length) return nav.languages;
  return nav.language ? [nav.language] : [];
}

/** Resolves the start-up locale from this browser's storage and language settings. */
export function detectLocale(): Locale {
  return resolveLocale({ stored: readStoredLocale(), languages: browserLanguages() });
}

export function storeLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Not fatal: the choice still applies for this page view.
  }
}
