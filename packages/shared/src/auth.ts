import { z } from 'zod';

/** Interface languages a user can save (decisions §12). */
export const LOCALES = ['vi', 'en'] as const;

export const localeSchema = z.enum(LOCALES);

export type Locale = z.infer<typeof localeSchema>;

/** Language of a new user when the browser offers neither `vi` nor `en`. */
export const DEFAULT_LOCALE: Locale = 'vi';

/** The signed-in user as `GET /api/me` returns it. */
export const meUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  locale: localeSchema,
  emailVerified: z.boolean(),
});

export type MeUser = z.infer<typeof meUserSchema>;

/** Body of `GET /api/me` (200). Without a valid session the API answers 401 `UNAUTHENTICATED`. */
export const meResponseSchema = z.object({ user: meUserSchema });

export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Error code of `POST /api/auth/sign-in/email` (429) after 10 failed sign-ins in 15 minutes for the
 * same IP and email (decisions §2). The password is not checked while it applies.
 */
export const SIGN_IN_RATE_LIMITED = 'SIGN_IN_RATE_LIMITED';

/** Body of the 429 `SIGN_IN_RATE_LIMITED` response; `retryAfterSeconds` is the time left in the window. */
export const signInRateLimitedErrorSchema = z.object({
  code: z.literal(SIGN_IN_RATE_LIMITED),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive(),
});

export type SignInRateLimitedError = z.infer<typeof signInRateLimitedErrorSchema>;

/**
 * Web app pages the email verification link lands on (decisions §2): the API checks the token,
 * then redirects to `WEB_ORIGIN` + one of these.
 */
export const VERIFY_EMAIL_SUCCESS_PATH = '/verify-email/success';
/** Expired, replaced by a newer link, or not a link the API issued. */
export const VERIFY_EMAIL_EXPIRED_PATH = '/verify-email/expired';

/**
 * Why `POST /api/auth/send-verification-email` answered 429 (decisions §2): a send within 60 s
 * of the last one, or a sixth send for the same email within an hour.
 */
export const RESEND_ERROR_CODES = ['RESEND_TOO_SOON', 'RESEND_LIMIT'] as const;

export type ResendErrorCode = (typeof RESEND_ERROR_CODES)[number];

/** Body of that 429. `retryAfterSeconds` (also sent as `Retry-After`): when a send is allowed. */
export const resendErrorSchema = z.object({
  code: z.enum(RESEND_ERROR_CODES),
  retryAfterSeconds: z.number().int().positive(),
});

export type ResendError = z.infer<typeof resendErrorSchema>;

/**
 * Password length rules, for sign-up and password reset alike. The API enforces the same bounds
 * (Better Auth `minPasswordLength` / `maxPasswordLength`) and answers 400 with these codes.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_ERROR_CODES = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'] as const;

export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[number];

/** A new password; issue messages are the error codes above, for the web app to translate. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: 'PASSWORD_TOO_SHORT' })
  .max(PASSWORD_MAX_LENGTH, { message: 'PASSWORD_TOO_LONG' });

/**
 * Web app pages the password reset link lands on (decisions §2): the API checks the token, then
 * redirects to `WEB_ORIGIN/reset-password?token=…`, where the user picks the new password and
 * sends it with the token to `POST /api/auth/reset-password`.
 */
export const RESET_PASSWORD_PATH = '/reset-password';
/** Expired (after 1 h), already used, replaced by a newer link, or unknown. */
export const RESET_PASSWORD_INVALID_PATH = '/reset-password/invalid';

/**
 * Code of `POST /api/auth/reset-password` (400) for a token that can no longer be used. Requesting
 * a reset (`POST /api/auth/request-password-reset`) answers 429 with `resendErrorSchema` under the
 * same limits as the verification resend.
 */
export const RESET_PASSWORD_INVALID_TOKEN = 'INVALID_TOKEN';
