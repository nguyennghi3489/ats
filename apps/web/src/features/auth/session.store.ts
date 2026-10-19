/**
 * Who is signed in. Sessions live in Postgres and Better Auth's cookie cache is off (decisions §2),
 * so the app asks the API (`GET /api/me`) instead of trusting any client-side copy.
 */
import { type MeUser, meResponseSchema } from '@ats/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getLocale, setLocale } from '../../i18n';
import { ApiError, api, CLIENT_ERROR_CODES } from '../../lib/api';
import { authApi } from './auth-client';

/** `unknown` until the first `load()` answers. */
export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out';

/** The code `GET /api/me` answers with (401) when there is no valid session. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

export const useSessionStore = defineStore('session', () => {
  const user = ref<MeUser | null>(null);
  const status = ref<SessionStatus>('unknown');
  const isSignedIn = computed(() => status.value === 'signed-in');

  let pending: Promise<void> | null = null;

  function clear(): void {
    user.value = null;
    status.value = 'signed-out';
  }

  async function fetchMe(): Promise<void> {
    let body: unknown;
    try {
      body = await api.get<unknown>('/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && error.code === UNAUTHENTICATED) {
        clear();
        return;
      }
      throw error;
    }

    const parsed = meResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(CLIENT_ERROR_CODES.unknown, 200, 'Malformed GET /api/me response', {
        cause: parsed.error,
      });
    }

    user.value = parsed.data.user;
    status.value = 'signed-in';
    // The saved account language wins over this device's choice (decisions §12).
    if (parsed.data.user.locale !== getLocale()) setLocale(parsed.data.user.locale);
  }

  /**
   * Asks the API who is signed in. A 401 `UNAUTHENTICATED` means signed out; any other failure
   * (including a response that does not match the shared schema) is thrown as `ApiError` and leaves
   * the state as it was. Concurrent callers share one request.
   */
  function load(): Promise<void> {
    pending ??= fetchMe().finally(() => {
      pending = null;
    });
    return pending;
  }

  /** Ends the session on the server, then forgets the user. A failed call throws and changes nothing. */
  async function signOut(): Promise<void> {
    await authApi.signOut();
    clear();
  }

  return { user, status, isSignedIn, load, signOut, clear };
});
