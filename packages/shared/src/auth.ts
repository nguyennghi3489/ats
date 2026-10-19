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

/** Password length rules; the same as Better Auth's defaults on the API. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Longest user name accepted at sign-up, after trimming. */
export const USER_NAME_MAX_LENGTH = 100;

/**
 * The sign-up form (design AUTH-01): full name, email and password. Name and email are trimmed;
 * the password is kept exactly as typed.
 */
export const signUpFormSchema = z.object({
  name: z.string().trim().min(1).max(USER_NAME_MAX_LENGTH),
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type SignUpForm = z.infer<typeof signUpFormSchema>;

export type SignUpField = keyof SignUpForm;

/** Why a sign-up field is refused. The web app shows `auth.signUp.errors.<code>`. */
export type SignUpFieldError =
  'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'EMAIL_INVALID' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG';

/** The first problem with each field of the sign-up form; an empty object when it is valid. */
export function signUpFieldErrors(
  input: Record<SignUpField, string>,
): Partial<Record<SignUpField, SignUpFieldError>> {
  const result = signUpFormSchema.safeParse(input);
  if (result.success) return {};
  const errors: Partial<Record<SignUpField, SignUpFieldError>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as SignUpField;
    if (errors[field]) continue;
    const tooBig = issue.code === 'too_big';
    if (field === 'name') errors.name = tooBig ? 'NAME_TOO_LONG' : 'NAME_REQUIRED';
    else if (field === 'email') errors.email = 'EMAIL_INVALID';
    else errors.password = tooBig ? 'PASSWORD_TOO_LONG' : 'PASSWORD_TOO_SHORT';
  }
  return errors;
}
