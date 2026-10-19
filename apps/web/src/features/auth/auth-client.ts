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
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';

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

/** Returns the data of a Better Auth call, or throws its failure as an `ApiError`. */
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
    throw new ApiError(code, error.status, error.message);
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

export function createAuthApi(options: AuthApiOptions) {
  const client = buildClient(options);

  return {
    /** The raw Better Auth client, for calls the helpers below do not cover yet. */
    client,
    signUp: (input: SignUpInput) => unwrap(client.signUp.email(input)),
    signIn: (input: SignInInput) => unwrap(client.signIn.email(input)),
    signOut: () => unwrap(client.signOut()),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;

/** App-wide auth client; follows `VITE_API_URL` like `lib/api.ts`, defaulting to `/api`. */
export const authApi = createAuthApi({ baseUrl: import.meta.env.VITE_API_URL || '/api' });
