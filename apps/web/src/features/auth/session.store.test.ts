import type { MeUser } from '@ats/shared';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocale, i18n, setLocale } from '../../i18n';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { useSessionStore } from './session.store';

const user: MeUser = {
  id: 'user-1',
  name: 'Nguyễn Văn An',
  email: 'an.nguyen@example.test',
  locale: 'vi',
  emailVerified: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestOf(call: Parameters<typeof fetch>) {
  const [input, init] = call;
  return input instanceof Request ? input : new Request(input, init);
}

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  setActivePinia(createPinia());
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale('vi');
});

describe('useSessionStore', () => {
  it('starts unknown with no user', () => {
    const session = useSessionStore();

    expect(session.status).toBe('unknown');
    expect(session.user).toBeNull();
    expect(session.isSignedIn).toBe(false);
  });

  it('load() with a valid session sets signed-in and the user from GET /api/me', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user }));
    const session = useSessionStore();

    await session.load();

    expect(fetchFn).toHaveBeenCalledOnce();
    const request = requestOf(fetchFn.mock.calls[0]!);
    expect(new URL(request.url).pathname).toBe('/api/me');
    expect(request.method).toBe('GET');
    expect(session.status).toBe('signed-in');
    expect(session.user).toEqual(user);
    expect(session.isSignedIn).toBe(true);
  });

  it('load() keeps only the fields of the shared schema', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user: { ...user, passwordHash: 'x' } }));
    const session = useSessionStore();

    await session.load();

    expect(session.user).toEqual(user);
  });

  it('load() on 401 UNAUTHENTICATED sets signed-out and no user, without throwing', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ code: 'UNAUTHENTICATED', message: 'Not signed in' }, 401),
    );
    const session = useSessionStore();

    await expect(session.load()).resolves.toBeUndefined();

    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
  });

  it('load() on 401 clears a user that was signed in before', async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ code: 'UNAUTHENTICATED' }, 401));
    const session = useSessionStore();

    await session.load();
    await session.load();

    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
  });

  it('load() rethrows other API errors and does not sign in', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR' }, 500));
    const session = useSessionStore();

    const error = await session.load().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(session.status).toBe('unknown');
    expect(session.user).toBeNull();
  });

  it('load() reports a malformed /api/me response as an error, not as signed in', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user: { id: 'user-1', email: 'not-an-email' } }));
    const session = useSessionStore();

    const error = await session.load().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODES.unknown, status: 200 });
    expect(session.status).not.toBe('signed-in');
    expect(session.user).toBeNull();
  });

  it('load() shares one request between concurrent callers', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user }));
    const session = useSessionStore();

    await Promise.all([session.load(), session.load()]);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('after load() for a user with locale en, the app shows English', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user: { ...user, locale: 'en' } }));
    const session = useSessionStore();

    await session.load();

    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.global.t('common.save')).toBe('Save');
  });

  it('after load() for a user with locale vi, an English page switches to Vietnamese', async () => {
    setLocale('en');
    fetchFn.mockResolvedValue(jsonResponse({ user }));
    const session = useSessionStore();

    await session.load();

    expect(getLocale()).toBe('vi');
  });

  it('signOut() calls the Better Auth sign-out endpoint and leaves the store signed out', async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const session = useSessionStore();
    await session.load();

    await session.signOut();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const request = requestOf(fetchFn.mock.calls[1]!);
    expect(new URL(request.url).pathname).toBe('/api/auth/sign-out');
    expect(request.method).toBe('POST');
    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
  });

  it('signOut() rethrows a failed sign-out as ApiError and keeps the session', async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const session = useSessionStore();
    await session.load();

    const error = await session.signOut().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODES.network });
    expect(session.status).toBe('signed-in');
    expect(session.user).toEqual(user);
  });

  it('clear() drops the user and marks the store signed out without a request', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ user }));
    const session = useSessionStore();
    await session.load();

    session.clear();

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
  });
});
