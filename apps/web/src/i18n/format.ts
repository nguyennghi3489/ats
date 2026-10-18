/**
 * Shared display formatters (decisions §12). Use these instead of `toLocaleString` so dates and money
 * look the same on every screen.
 */
import { getLocale, type Locale } from './index';

const NUMBER_LOCALE: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: Date | string | number): Date | undefined {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value);
    if (match) {
      // A calendar date (e.g. a start date) has no time zone: read it as that local day, not UTC.
      const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
      const date = new Date(year, month - 1, day);
      const valid =
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
      return valid ? date : undefined;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** `dd/mm/yyyy` in every locale, in the browser's time zone. Invalid input gives `''`. */
export function formatDate(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export type Currency = 'VND' | 'USD';

const FRACTION_DIGITS: Record<Currency, number> = { VND: 0, USD: 2 };

/**
 * Amount with the active locale's grouping, then the currency code:
 * `25.000.000 VND` in vi, `25,000,000 VND` in en.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  locale: Locale = getLocale(),
): string {
  const number = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: FRACTION_DIGITS[currency],
  }).format(amount);
  return `${number} ${currency}`;
}
