import type { MeUser } from '@ats/shared';
import { createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import { setLocale } from '../../i18n';
import { api } from '../../lib/api';
import { createAppRouter } from '../../router';
import { installAuthGuard } from './guard';
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

const unauthenticated = () => jsonResponse({ code: 'UNAUTHENTICATED', message: 'No session' }, 401);

function pathOf(input: Parameters<typeof fetch>[0]): string {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, 'http://localhost').pathname;
}

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let pinia: Pinia;
let router: Router;
let uninstall: () => void;

/** Answers GET /api/me with `me` and every other request with `other`. */
function serve(me: () => Response, other: () => Response = () => jsonResponse({ ok: true })) {
  fetchFn.mockImplementation((input) =>
    Promise.resolve(pathOf(input) === '/api/me' ? me() : other()),
  );
}

const meCalls = () => fetchFn.mock.calls.filter(([input]) => pathOf(input) === '/api/me').length;

beforeEach(() => {
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  router = createAppRouter(createMemoryHistory(), false);
  uninstall = installAuthGuard(router, pinia);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('auth guard: signed out', () => {
  beforeEach(() => serve(unauthenticated));

  it('sends / to /sign-in?redirect=%2F', async () => {
    await router.push('/');

    expect(router.currentRoute.value.fullPath).toBe('/sign-in?redirect=%2F');
    expect(router.currentRoute.value.query).toEqual({ redirect: '/' });
  });

  it('keeps the full deep-link path, query included, in redirect', async () => {
    await router.push('/jobs?status=open');

    expect(router.currentRoute.value.path).toBe('/sign-in');
    expect(router.currentRoute.value.query.redirect).toBe('/jobs?status=open');
  });

  it.each([
    '/sign-in',
    '/sign-in?redirect=%2Fjobs&expired=1',
    '/sign-up',
    '/verify-email?email=an%40example.test',
    '/verify-email/abc123',
    '/forgot-password',
    '/reset-password',
    '/reset-password/abc123',
  ])('lets %s open without a session', async (path) => {
    await router.push(path);

    expect(router.currentRoute.value.fullPath).toBe(path);
  });

  it('asks the API for the session once per app start', async () => {
    await router.push('/sign-up');
    await router.push('/forgot-password');
    await router.push('/jobs');

    expect(meCalls()).toBe(1);
  });
});

describe('auth guard: signed in', () => {
  beforeEach(() => serve(() => jsonResponse({ user })));

  it('opens a protected page', async () => {
    await router.push('/jobs?status=open');

    expect(router.currentRoute.value.fullPath).toBe('/jobs?status=open');
    expect(useSessionStore(pinia).isSignedIn).toBe(true);
  });

  it.each(['/sign-in', '/sign-in?redirect=%2Fjobs', '/sign-up'])('sends %s to /', async (path) => {
    await router.push(path);

    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('still lets the other auth pages open', async () => {
    await router.push('/reset-password/abc123');

    expect(router.currentRoute.value.fullPath).toBe('/reset-password/abc123');
  });
});

describe('auth guard: session check fails', () => {
  it('treats a failed /api/me as signed out and asks again on the next navigation', async () => {
    serve(() => jsonResponse({ code: 'INTERNAL_ERROR' }, 500));

    await router.push('/jobs');
    expect(router.currentRoute.value.path).toBe('/sign-in');

    serve(() => jsonResponse({ user }));
    await router.push('/jobs');
    expect(router.currentRoute.value.fullPath).toBe('/jobs');
    expect(meCalls()).toBe(2);
  });
});

describe('auth guard: session expires mid-use', () => {
  beforeEach(async () => {
    serve(() => jsonResponse({ user }));
    await router.push('/jobs?status=open');
    serve(unauthenticated, unauthenticated);
  });

  it('clears the session and returns to sign-in with the current path and expired=1', async () => {
    await api.get('/jobs').catch(() => undefined);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/sign-in'));

    expect(router.currentRoute.value.query).toEqual({
      redirect: '/jobs?status=open',
      expired: '1',
    });
    expect(router.currentRoute.value.fullPath).toBe(
      '/sign-in?redirect=%2Fjobs%3Fstatus%3Dopen&expired=1',
    );
    const session = useSessionStore(pinia);
    expect(session.status).toBe('signed-out');
    expect(session.user).toBeNull();
  });

  it('navigates once for three parallel requests that fail with 401', async () => {
    const push = vi.spyOn(router, 'push');

    await Promise.allSettled([api.get('/jobs'), api.get('/candidates'), api.get('/me')]);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/sign-in'));

    expect(push).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.query.expired).toBe('1');
  });

  it('does not redirect from a public auth page', async () => {
    serve(() => jsonResponse({ user }));
    await router.push('/reset-password/abc123');
    serve(unauthenticated, unauthenticated);
    const push = vi.spyOn(router, 'push');

    await api.get('/jobs').catch(() => undefined);

    expect(push).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/reset-password/abc123');
    expect(useSessionStore(pinia).status).toBe('signed-out');
  });
});

describe('auth guard: 401 while already signed out', () => {
  it('does not navigate', async () => {
    serve(unauthenticated, unauthenticated);
    await router.push('/sign-up');
    const push = vi.spyOn(router, 'push');

    await api.get('/jobs').catch(() => undefined);

    expect(push).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/sign-up');
  });
});
