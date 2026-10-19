import { RESET_PASSWORD_PATH } from '@ats/shared';
import { and, eq, like, ne } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { DatabaseClient } from '../database/database.js';
import { verification } from './auth.schema.js';
import { VerificationResend, type VerificationResendOptions } from './verification-resend.js';

/** Password reset link: valid 1 h, single use (decisions §2). */
export const RESET_PASSWORD_LINK_EXPIRES_IN_SECONDS = 60 * 60;

/** Better Auth's endpoint that sends the reset email; the request limits apply to it. */
export const REQUEST_PASSWORD_RESET_PATH = '/request-password-reset';

/** Better Auth's endpoint the emailed link opens; it redirects to the web app. */
export const RESET_PASSWORD_CALLBACK_PATH = '/reset-password/:token';

/**
 * How Better Auth 1.7 names reset tokens in the `verification` table (`value` holds the user id).
 * Fixed by Better Auth: see `requestPasswordReset` in `better-auth/dist/api/routes/password.mjs`.
 */
const IDENTIFIER_PREFIX = 'reset-password:';

export function resetPasswordIdentifier(token: string): string {
  return `${IDENTIFIER_PREFIX}${token}`;
}

/**
 * Whether a stored reset token can still be used. Better Auth deletes the row when the password is
 * reset, so a used token, like an unknown or replaced one, has no row.
 */
export function isUsableResetLink(
  stored: { expiresAt: Date } | null | undefined,
  now: number = Date.now(),
): boolean {
  return stored != null && stored.expiresAt.getTime() > now;
}

/** The web page where the user picks the new password: `WEB_ORIGIN/reset-password?token=…`. */
export function webResetPageUrl(webOrigin: string, token: string): string {
  const url = new URL(RESET_PASSWORD_PATH, webOrigin);
  url.searchParams.set('token', token);
  return url.href;
}

/**
 * The reset request limits: the same 60 s cooldown and 5 per rolling hour per email as the
 * verification resend, counted separately (keys under `reset-password`).
 */
export function createPasswordResetLimits(
  redis: Redis,
  options: Pick<VerificationResendOptions, 'secret' | 'keyPrefix'>,
): VerificationResend {
  return new VerificationResend(redis, { ...options, namespace: 'reset-password' });
}

/**
 * A new reset link invalidates the old ones: deletes every reset token of `userId` except
 * `token`, so only the newest emailed link still works.
 */
export async function invalidateEarlierResetLinks(
  db: DatabaseClient,
  userId: string,
  token: string,
): Promise<void> {
  await db
    .delete(verification)
    .where(
      and(
        eq(verification.value, userId),
        like(verification.identifier, `${IDENTIFIER_PREFIX}%`),
        ne(verification.identifier, resetPasswordIdentifier(token)),
      ),
    );
}
