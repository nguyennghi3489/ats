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
