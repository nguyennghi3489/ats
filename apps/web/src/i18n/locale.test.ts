import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_STORAGE_KEY, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('uses a stored supported choice first', () => {
    expect(resolveLocale({ stored: 'vi', languages: ['en-US'] })).toBe('vi');
    expect(resolveLocale({ stored: 'en', languages: ['vi-VN'] })).toBe('en');
  });

  it('ignores an unsupported stored value', () => {
    expect(resolveLocale({ stored: 'fr', languages: ['en-US'] })).toBe('en');
  });

  it('takes the first vi/en match from the browser languages', () => {
    expect(resolveLocale({ stored: null, languages: ['en-US'] })).toBe('en');
    expect(resolveLocale({ stored: null, languages: ['fr-FR', 'vi', 'en'] })).toBe('vi');
    expect(resolveLocale({ stored: null, languages: ['de', 'EN-gb'] })).toBe('en');
  });

  it('falls back to vi when the browser has no vi/en language', () => {
    expect(resolveLocale({ stored: null, languages: ['fr'] })).toBe('vi');
    expect(resolveLocale({ stored: null, languages: [] })).toBe('vi');
  });
});

describe('active locale', () => {
  let languages: string[];

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
    languages = ['en-US'];
    vi.spyOn(navigator, 'languages', 'get').mockImplementation(() => languages);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts in English with an English browser and nothing stored', async () => {
    const { i18n, getLocale } = await import('./index');

    expect(getLocale()).toBe('en');
    expect(i18n.global.locale.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('starts in Vietnamese with a French browser and nothing stored', async () => {
    languages = ['fr'];
    const { getLocale } = await import('./index');

    expect(getLocale()).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
  });

  it('setLocale updates i18n, <html lang> and storage, and survives a reload', async () => {
    const first = await import('./index');
    expect(first.getLocale()).toBe('en');

    first.setLocale('vi');

    expect(first.i18n.global.locale.value).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi');

    // A reload: a fresh module graph with the same English browser and the same storage.
    vi.resetModules();
    const reloaded = await import('./index');
    expect(reloaded.getLocale()).toBe('vi');
  });

  it('notifies locale-change listeners until they unsubscribe', async () => {
    const { onLocaleChange, setLocale } = await import('./index');
    const listener = vi.fn();
    const off = onLocaleChange(listener);

    setLocale('vi');
    off();
    setLocale('en');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('vi');
  });

  it('still switches when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { getLocale, setLocale } = await import('./index');

    setLocale('vi');
    expect(getLocale()).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
  });
});
