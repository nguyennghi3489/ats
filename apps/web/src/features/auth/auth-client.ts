/**
 * The web app's one Better Auth client (decisions §2). Better Auth is served by the API under
 * `/api/auth`; this client always sends cookies so the session cookie travels with every call.
 *
 * Screens use the helpers returned by `createAuthApi` rather than the raw client: they throw the same
 * `ApiError` as `lib/api.ts`, so a Better Auth `code` is translated like any other API error (§12).
 */
import type { Locale } from '@ats/shared';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';
import { ApiError, CLIENT_ERROR_CODES, notifyUnauthenticated } from '../../lib/api';

/** Where the API mounts Better Auth, relative to the API base URL. */
export const AUTH_PATH = '/auth';

/**
 * Absolute Better Auth URL for an API base such as `/api` or `https://api.example.com/api`. Better
 * Auth needs an absolute URL, so a relative base is resolved against the page origin.
 */
export function authBaseUrl(apiBaseUrl: string, origin: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return new URL(`${base}${AUTH_PATH}`, origin).href;
}

export interface AuthApiOptions {
  /** API base URL, e.g. `/api` (the default) or the value of `VITE_API_URL`. */
  baseUrl: string;
  /** Origin that a relative `baseUrl` is resolved against; defaults to the page origin. */
  origin?: string;
  /** Fetch implementation; defaults to the global `fetch`, looked up on each call. */
  fetch?: typeof fetch;
}

/** Shape of `error` in Better Auth's `{ data, error }` results. */
interface BetterAuthError {
  code?: string;
  message?: string;
  status: number;
}

type BetterAuthResult<T> = { data: T; error: null } | { data: null; error: BetterAuthError };

/**
 * What Better Auth answers (401) when a call needs a session and the request has none, e.g. after a
 * password change on another device revoked this one (decisions §2).
 */
export const BETTER_AUTH_UNAUTHORIZED = 'UNAUTHORIZED';

/**
 * Returns the data of a Better Auth call, or throws its failure as an `ApiError`. A 401
 * `UNAUTHORIZED` is first reported like the API's `UNAUTHENTICATED`, so the guard ends the session.
 */
export async function unwrap<T>(call: Promise<BetterAuthResult<T>>): Promise<T> {
  let result: BetterAuthResult<T>;
  try {
    result = await call;
  } catch (cause) {
    throw new ApiError(CLIENT_ERROR_CODES.network, 0, undefined, { cause });
  }
  const { error } = result;
  if (error) {
    const code =
      typeof error.code === 'string' && error.code.length > 0
        ? error.code
        : CLIENT_ERROR_CODES.unknown;
    // The whole error body is the cause, so a screen can read extra fields such as `retryAfterSeconds`.
    const apiError = new ApiError(code, error.status, error.message, { cause: error });
    if (apiError.status === 401 && apiError.code === BETTER_AUTH_UNAUTHORIZED) {
      notifyUnauthenticated(apiError);
    }
    throw apiError;
  }
  return result.data as T;
}

function pageOrigin(): string {
  return globalThis.location?.origin ?? 'http://localhost';
}

function buildClient(options: AuthApiOptions) {
  const fetchFn: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  return createAuthClient({
    baseURL: authBaseUrl(options.baseUrl, options.origin ?? pageOrigin()),
    fetchOptions: { credentials: 'include', customFetchImpl: fetchFn },
    // Mirrors the API's `user.additionalFields` so sign-up accepts the interface language.
    plugins: [inferAdditionalFields({ user: { locale: { type: 'string', required: false } } })],
  });
}

export type AuthClient = ReturnType<typeof buildClient>;

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  locale: Locale;
  /** Where the email verification link lands after verifying. */
  callbackURL?: string;
}

export interface SignInInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  callbackURL?: string;
}

export interface PasswordResetRequestInput {
  email: string;
}

export function createAuthApi(options: AuthApiOptions) {
  const client = buildClient(options);

  return {
    /** The raw Better Auth client, for calls the helpers below do not cover yet. */
    client,
    signUp: (input: SignUpInput) => unwrap(client.signUp.email(input)),
    signIn: (input: SignInInput) => unwrap(client.signIn.email(input)),
    signOut: () => unwrap(client.signOut()),
    /**
     * Emails a reset link if the address has an account. The API answers unknown addresses the same
     * way and refuses a request too soon or too often (`RESEND_TOO_SOON`, `RESEND_LIMIT`, decisions §2).
     * Where the link lands is fixed by the API, so no `redirectTo` is sent.
     */
    requestPasswordReset: (input: PasswordResetRequestInput) =>
      unwrap(client.requestPasswordReset(input)),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;

/** App-wide auth client; follows `VITE_API_URL` like `lib/api.ts`, defaulting to `/api`. */
export const authApi = createAuthApi({ baseUrl: import.meta.env.VITE_API_URL || '/api' });
