/**
 * The `redirect` query that carries a visitor back to the page they asked for after signing in.
 * Only same-origin paths are followed, so a crafted sign-in link cannot send users to another site.
 */

/** Where sign-in sends users when `redirect` is missing or unsafe. */
export const DEFAULT_REDIRECT = '/';

export const SIGN_IN_PATH = '/sign-in';

/** A placeholder origin to resolve against: a path that stays on it stays on ours. */
const PROBE_ORIGIN = 'https://ats.invalid';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Returns `value` when it is a same-origin path starting with a single `/`, otherwise `/`. Accepts a
 * raw router query value (string, array of strings, null or undefined).
 */
export function safeRedirect(value: unknown): string {
  const candidate: unknown = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return DEFAULT_REDIRECT;
  // `//host` and `/\host` are protocol-relative to browsers. The URL parser drops tabs and newlines,
  // which could turn `/\t/host` into `//host`, so control characters are refused outright.
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.startsWith('/\\') ||
    CONTROL_CHARS.test(candidate)
  ) {
    return DEFAULT_REDIRECT;
  }
  try {
    if (new URL(candidate, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
  return candidate;
}

/** `/sign-in?redirect=<path>`, plus `&expired=1` when the session ran out mid-use. */
export function signInPath(redirect: string, options: { expired?: boolean } = {}): string {
  const query = `redirect=${encodeURIComponent(redirect)}`;
  return `${SIGN_IN_PATH}?${query}${options.expired ? '&expired=1' : ''}`;
}
