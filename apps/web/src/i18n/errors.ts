/**
 * API error codes to user-facing text (decisions §12). The API sends a `code`; the message shown is
 * `errors.<code>` in the active locale, or `errors.unknown` when the app has no text for that code.
 */
import { i18n } from './index';

// Codes are identifiers like `WORKSPACE_ACCESS_REVOKED`; anything else cannot name a message.
const CODE_PATTERN = /^[A-Za-z0-9_]+$/;

export function translateError(code: string): string {
  const { t, te } = i18n.global;
  const key = `errors.${code}`;
  if (CODE_PATTERN.test(code) && te(key)) {
    const text = t(key);
    if (text !== key) return text;
  }
  return t('errors.unknown');
}
