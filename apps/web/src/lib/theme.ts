import { readonly, ref, type Ref } from 'vue';

/**
 * Light / dark / system theme (decisions §12, §13). The resolved theme is written as `data-theme` on
 * `<html>`; the pre-paint script in `index.html` mirrors `parseThemePreference` + `resolveTheme` so the
 * first paint already has the right theme. Keep the two in step.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Called after a theme change is applied locally, e.g. to save it to the user's settings. */
export type ThemePersistHook = (preference: ThemePreference) => void | Promise<void>;

export const THEME_STORAGE_KEY = 'ats.theme';
export const THEME_ATTRIBUTE = 'data-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export interface ThemeEnvironment {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  matchMedia?: ((query: string) => MediaQueryList) | null;
  root?: HTMLElement | null;
}

export interface ThemeController {
  /** What the user chose. */
  readonly preference: Readonly<Ref<ThemePreference>>;
  /** What is shown right now. */
  readonly resolved: Readonly<Ref<ResolvedTheme>>;
  /** Applies and remembers the choice on this device, then runs `persist` if given. */
  setTheme(preference: ThemePreference, persist?: ThemePersistHook): Promise<void>;
  /** Stops following the OS setting. */
  dispose(): void;
}

function browserEnvironment(): ThemeEnvironment {
  if (typeof window === 'undefined') return {};
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    // Storage can be blocked entirely (privacy settings); the theme then lasts for the page only.
  }
  return {
    storage,
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null,
    root: document.documentElement,
  };
}

export function createThemeController(
  env: ThemeEnvironment = browserEnvironment(),
): ThemeController {
  const { storage, root } = env;
  const media = env.matchMedia ? env.matchMedia(DARK_QUERY) : null;

  function readStored(): ThemePreference {
    try {
      return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
    } catch {
      return 'system';
    }
  }

  const preference = ref<ThemePreference>(readStored());
  const resolved = ref<ResolvedTheme>('light');

  function apply(): void {
    resolved.value = resolveTheme(preference.value, media?.matches ?? false);
    root?.setAttribute(THEME_ATTRIBUTE, resolved.value);
  }

  const onSystemChange = (): void => {
    if (preference.value === 'system') apply();
  };
  media?.addEventListener('change', onSystemChange);
  apply();

  return {
    preference: readonly(preference),
    resolved: readonly(resolved),
    async setTheme(next, persist) {
      preference.value = parseThemePreference(next);
      apply();
      try {
        storage?.setItem(THEME_STORAGE_KEY, preference.value);
      } catch {
        // Quota or privacy errors: the choice still applies for this page.
      }
      if (persist) await persist(preference.value);
    },
    dispose() {
      media?.removeEventListener('change', onSystemChange);
    },
  };
}

let shared: ThemeController | null = null;

/** Starts the app-wide theme controller; call once before mounting. */
export function initTheme(env?: ThemeEnvironment): ThemeController {
  shared?.dispose();
  shared = createThemeController(env);
  return shared;
}

/** The app-wide theme: `preference`, `resolved` and `setTheme(pref, persist?)`. */
export function useTheme(): ThemeController {
  return shared ?? initTheme();
}
