import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sessionTokenFromCookies } from './session-cookie.js';

const SECRET = 'test-only-better-auth-secret-0123456789abcdef';
const NAME = 'better-auth.session_token';

/** The cookie value Better Auth sets: `token.base64(hmac-sha256(token))`, URI-encoded. */
function signed(token: string, secret = SECRET): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}

describe('sessionTokenFromCookies', () => {
  it('returns the token of a correctly signed session cookie', () => {
    const header = `other=1; ${NAME}=${signed('abc123')}; last=2`;

    expect(sessionTokenFromCookies(header, NAME, SECRET)).toBe('abc123');
  });

  it('is null without a cookie header or without the session cookie', () => {
    expect(sessionTokenFromCookies(undefined, NAME, SECRET)).toBeNull();
    expect(sessionTokenFromCookies('other=1', NAME, SECRET)).toBeNull();
  });

  it('is null for a forged, unsigned or differently signed value', () => {
    expect(sessionTokenFromCookies(`${NAME}=forged.value`, NAME, SECRET)).toBeNull();
    expect(sessionTokenFromCookies(`${NAME}=abc123`, NAME, SECRET)).toBeNull();
    expect(
      sessionTokenFromCookies(`${NAME}=${signed('abc123', 'another-secret')}`, NAME, SECRET),
    ).toBeNull();
  });

  it('only reads the cookie with the exact name', () => {
    const header = `__Secure-${NAME}=${signed('abc123')}`;

    expect(sessionTokenFromCookies(header, NAME, SECRET)).toBeNull();
    expect(sessionTokenFromCookies(header, `__Secure-${NAME}`, SECRET)).toBe('abc123');
  });
});
