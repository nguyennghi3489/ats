import { describe, expect, it } from 'vitest';
import { translateError } from './errors';
import { setLocale } from './index';
import en from './locales/en.json';
import vi from './locales/vi.json';

describe('translateError', () => {
  it('translates a known code in the active locale', () => {
    setLocale('vi');
    expect(translateError('NETWORK_ERROR')).toBe(vi.errors.NETWORK_ERROR);
    setLocale('en');
    expect(translateError('NETWORK_ERROR')).toBe(en.errors.NETWORK_ERROR);
  });

  it('falls back to errors.unknown for an unknown code, never the raw code', () => {
    setLocale('en');
    const text = translateError('SOMETHING_NOBODY_DEFINED');
    expect(text).toBe(en.errors.unknown);
    expect(text).not.toContain('SOMETHING_NOBODY_DEFINED');
  });

  it('does not treat an empty code or a dotted path as a message key', () => {
    setLocale('vi');
    expect(translateError('')).toBe(vi.errors.unknown);
    expect(translateError('unknown.x')).toBe(vi.errors.unknown);
  });
});
