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
