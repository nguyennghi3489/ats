import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseCookies } from 'better-auth/cookies';

/**
 * The session token in Better Auth's signed session cookie (`token.base64(hmac-sha256(token))`,
 * keyed with the auth secret), or `null` when the cookie is missing, unsigned or forged. Reading
 * the token locally keeps access resolution to the one query of `resolveAccess`.
 */
export function sessionTokenFromCookies(
  cookieHeader: string | undefined,
  cookieName: string,
  secret: string,
): string | null {
  if (!cookieHeader) return null;
  const value = parseCookies(cookieHeader).get(cookieName);
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const token = value.slice(0, separator);
  const signature = Buffer.from(value.slice(separator + 1), 'base64');
  const expected = createHmac('sha256', secret).update(token).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  return token;
}
