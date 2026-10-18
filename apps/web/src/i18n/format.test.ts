import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney } from './format';
import { setLocale } from './index';

describe('formatDate', () => {
  it('returns dd/mm/yyyy in both locales', () => {
    const date = new Date(2026, 2, 5);
    for (const locale of ['vi', 'en'] as const) {
      setLocale(locale);
      expect(formatDate(date)).toBe('05/03/2026');
    }
  });

  it('reads a date-only ISO string as that calendar day', () => {
    expect(formatDate('2026-03-05')).toBe('05/03/2026');
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });

  it('accepts a full ISO timestamp and a millisecond value', () => {
    const date = new Date(2026, 0, 9, 14, 30);
    expect(formatDate(date.toISOString())).toBe('09/01/2026');
    expect(formatDate(date.getTime())).toBe('09/01/2026');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDate('not a date')).toBe('');
    expect(formatDate('2026-02-30')).toBe('');
  });
});

describe('formatMoney', () => {
  it('groups VND with dots in vi and commas in en', () => {
    setLocale('vi');
    expect(formatMoney(25000000, 'VND')).toBe('25.000.000 VND');
    setLocale('en');
    expect(formatMoney(25000000, 'VND')).toBe('25,000,000 VND');
  });

  it('formats USD with up to two decimals in the locale style', () => {
    setLocale('vi');
    expect(formatMoney(1500.5, 'USD')).toBe('1.500,5 USD');
    expect(formatMoney(2000, 'USD')).toBe('2.000 USD');
    setLocale('en');
    expect(formatMoney(1500.5, 'USD')).toBe('1,500.5 USD');
  });

  it('rounds VND to whole units', () => {
    setLocale('en');
    expect(formatMoney(1234.6, 'VND')).toBe('1,235 VND');
  });
});
