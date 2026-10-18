import { afterEach, describe, expect, it, vi } from 'vitest';
import html from '../../index.html?raw';
import {
  THEME_STORAGE_KEY,
  createThemeController,
  parseThemePreference,
  resolveTheme,
  type ThemeEnvironment,
} from './theme';

/** A controllable `prefers-color-scheme: dark` media query. */
function fakeMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn((_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    }),
  } as unknown as MediaQueryList;
  const matchMedia = vi.fn<(q: string) => MediaQueryList>(() => query);
  return {
    matchMedia,
    listeners,
    setDark(next: boolean) {
      dark = next;
      for (const cb of [...listeners]) cb({ matches: next } as MediaQueryListEvent);
    },
  };
}

function setup(options: { dark?: boolean; stored?: string | null } = {}) {
  localStorage.clear();
  if (options.stored != null) localStorage.setItem(THEME_STORAGE_KEY, options.stored);
  const media = fakeMatchMedia(options.dark ?? false);
  const root = document.createElement('html');
  const env: ThemeEnvironment = { storage: localStorage, matchMedia: media.matchMedia, root };
  return { media, root, env };
}

afterEach(() => {
  localStorage.clear();
});

describe('parseThemePreference', () => {
  it.each(['light', 'dark', 'system'] as const)('accepts %s', (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it.each([null, undefined, '', 'Dark', ' light', 'blue', '{"theme":"dark"}', 42])(
    'falls back to system for %j',
    (value) => {
      expect(parseThemePreference(value)).toBe('system');
    },
  );
});

describe('resolveTheme', () => {
  it('keeps explicit choices regardless of the OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('createThemeController', () => {
  it('defaults to system and applies the OS dark theme on start', () => {
    const { root, env, media } = setup({ dark: true });
    const theme = createThemeController(env);

    expect(theme.preference.value).toBe('system');
    expect(theme.resolved.value).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(media.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    theme.dispose();
  });

  it('updates live when the OS setting changes while on system', () => {
    const { root, env, media } = setup({ dark: true });
    const theme = createThemeController(env);

    media.setDark(false);

    expect(theme.resolved.value).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');

    media.setDark(true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.dispose();
  });

  it('ignores OS changes while an explicit theme is chosen', () => {
    const { root, env, media } = setup({ dark: true, stored: 'light' });
    const theme = createThemeController(env);

    expect(root.getAttribute('data-theme')).toBe('light');
    media.setDark(false);
    media.setDark(true);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(theme.resolved.value).toBe('light');
    theme.dispose();
  });

  it('reads a stored preference', () => {
    const { root, env } = setup({ dark: false, stored: 'dark' });
    const theme = createThemeController(env);

    expect(theme.preference.value).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.dispose();
  });

  it('treats a garbage stored value like system', () => {
    const { root, env } = setup({ dark: true, stored: 'purple' });
    const theme = createThemeController(env);

    expect(theme.preference.value).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.dispose();
  });

  it('setTheme applies, stores, and survives a new controller (reload) with the OS dark', async () => {
    const { root, env } = setup({ dark: true });
    const theme = createThemeController(env);

    await theme.setTheme('light');

    expect(theme.preference.value).toBe('light');
    expect(theme.resolved.value).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    theme.dispose();

    const reloadedRoot = document.createElement('html');
    const reloaded = createThemeController({ ...env, root: reloadedRoot });
    expect(reloadedRoot.getAttribute('data-theme')).toBe('light');
    reloaded.dispose();
  });

  it('setTheme back to system follows the OS again', async () => {
    const { root, env, media } = setup({ dark: false, stored: 'dark' });
    const theme = createThemeController(env);

    await theme.setTheme('system');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');

    media.setDark(true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.dispose();
  });

  it('setTheme calls the optional persist hook with the new preference after applying it', async () => {
    const { root, env } = setup({ dark: false });
    const theme = createThemeController(env);
    const seen: (string | null)[] = [];
    const persist = vi.fn(async (pref: string) => {
      seen.push(root.getAttribute('data-theme'));
      expect(pref).toBe('dark');
    });

    await theme.setTheme('dark', persist);

    expect(persist).toHaveBeenCalledOnce();
    expect(seen).toEqual(['dark']);
    theme.dispose();
  });

  it('setTheme surfaces a failing persist hook but keeps the local choice', async () => {
    const { root, env } = setup({ dark: false });
    const theme = createThemeController(env);

    await expect(
      theme.setTheme('dark', () => Promise.reject(new Error('network'))),
    ).rejects.toThrow('network');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    theme.dispose();
  });

  it('setTheme rejects values outside the preference set by treating them as system', async () => {
    const { env } = setup({ dark: true, stored: 'light' });
    const theme = createThemeController(env);

    await theme.setTheme('neon' as never);
    expect(theme.preference.value).toBe('system');
    expect(theme.resolved.value).toBe('dark');
    theme.dispose();
  });

  it('works when storage throws (private mode) and when matchMedia is missing', async () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const root = document.createElement('html');
    const theme = createThemeController({ storage, matchMedia: undefined, root });

    expect(theme.preference.value).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('light');
    await theme.setTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.dispose();
  });

  it('dispose stops listening to the OS', () => {
    const { env, media } = setup({ dark: true });
    const theme = createThemeController(env);
    expect(media.listeners.size).toBe(1);

    theme.dispose();
    expect(media.listeners.size).toBe(0);
  });
});

describe('index.html pre-paint script', () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

  function runPrePaint(options: { dark: boolean; stored?: string | null }) {
    localStorage.clear();
    if (options.stored != null) localStorage.setItem(THEME_STORAGE_KEY, options.stored);
    document.documentElement.removeAttribute('data-theme');
    const media = fakeMatchMedia(options.dark);
    vi.stubGlobal('matchMedia', media.matchMedia);
    try {
      new Function(inline[0]!)();
    } finally {
      vi.unstubAllGlobals();
    }
    return document.documentElement.getAttribute('data-theme');
  }

  it('is a single classic inline script placed in <head> before the module bundle', () => {
    expect(inline).toHaveLength(1);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain(inline[0]);
    expect(html.indexOf(inline[0]!)).toBeLessThan(html.indexOf('type="module"'));
  });

  it('applies a stored dark theme even when the OS is light', () => {
    expect(runPrePaint({ dark: false, stored: 'dark' })).toBe('dark');
  });

  it('applies a stored light theme even when the OS is dark', () => {
    expect(runPrePaint({ dark: true, stored: 'light' })).toBe('light');
  });

  it('follows the OS with no stored preference', () => {
    expect(runPrePaint({ dark: true })).toBe('dark');
    expect(runPrePaint({ dark: false })).toBe('light');
  });

  it('treats a garbage stored value like system', () => {
    expect(runPrePaint({ dark: true, stored: 'garbage' })).toBe('dark');
  });
});
