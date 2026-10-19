import type { MeUser } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import { installAuthGuard } from '../features/auth/guard';
import { i18n, setLocale } from '../i18n';
import { buildRoutes, createAppRouter, stringifyQuery } from './index';

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

let uninstall: (() => void) | undefined;

/** Stubs GET /api/me: signed in as `user`, or 401 UNAUTHENTICATED when signed out. */
function signedIn(yes: boolean) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          yes ? jsonResponse({ user }) : jsonResponse({ code: 'UNAUTHENTICATED' }, 401),
        ),
      ),
  );
}

/** Mounts the app as main.ts does: the auth guard installed on the router before the first push. */
async function mountAt(path: string, isDev?: boolean) {
  const pinia = createPinia();
  const router = createAppRouter(createMemoryHistory(), isDev);
  uninstall = installAuthGuard(router, pinia);
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router, pinia, i18n] } });
  return { wrapper, router };
}

beforeEach(() => {
  setLocale('vi');
  signedIn(true);
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.unstubAllGlobals();
});

describe('router', () => {
  it('renders the placeholder home page at /', async () => {
    const { wrapper } = await mountAt('/');

    expect(wrapper.find('[data-testid="home-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(false);
  });

  it('renders the 404 page for an unknown URL', async () => {
    const { wrapper } = await mountAt('/khong-ton-tai/abc');

    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="home-page"]').exists()).toBe(false);
  });

  it('serves the UI gallery at /dev/ui in development', async () => {
    const { wrapper } = await mountAt('/dev/ui', true);
    await flushPromises();

    expect(wrapper.find('[data-testid="ui-gallery"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(false);
  });

  it('answers /dev/ui with the 404 page in a production build', async () => {
    const { wrapper } = await mountAt('/dev/ui', false);
    await flushPromises();

    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ui-gallery"]').exists()).toBe(false);
  });

  it('keeps the full path of a deep link in redirect when signed out', async () => {
    signedIn(false);
    const { router, wrapper } = await mountAt('/jobs?status=open');

    expect(router.currentRoute.value.path).toBe('/sign-in');
    expect(router.currentRoute.value.query.redirect).toBe('/jobs?status=open');
    expect(router.currentRoute.value.fullPath).toBe('/sign-in?redirect=%2Fjobs%3Fstatus%3Dopen');
    expect(wrapper.find('[data-testid="home-page"]').exists()).toBe(false);
  });

  it('sends a signed-out visitor at / to /sign-in?redirect=%2F', async () => {
    signedIn(false);
    const { router } = await mountAt('/');

    expect(router.currentRoute.value.fullPath).toBe('/sign-in?redirect=%2F');
  });

  it('sends an unknown URL to sign-in when signed out, like any other page', async () => {
    signedIn(false);
    const { router } = await mountAt('/khong-ton-tai/abc');

    expect(router.currentRoute.value.query.redirect).toBe('/khong-ton-tai/abc');
  });

  it('marks exactly the auth pages and the dev gallery public', () => {
    const publicPaths = buildRoutes(true)
      .filter((route) => route.meta?.public)
      .map((route) => route.path);

    expect(publicPaths).toEqual([
      '/sign-in',
      '/sign-up',
      '/verify-email/:rest(.*)*',
      '/forgot-password',
      '/reset-password/:rest(.*)*',
      '/dev/ui',
    ]);
    expect(buildRoutes(false).find((route) => route.path === '/')?.meta?.public).toBeUndefined();
  });

  it('leaves the gallery route out of the production route table', () => {
    expect(buildRoutes(false).map((route) => route.path)).not.toContain('/dev/ui');
    expect(buildRoutes(true).map((route) => route.path)).toContain('/dev/ui');
  });
});

describe('stringifyQuery', () => {
  it('encodes values like encodeURIComponent', () => {
    expect(stringifyQuery({ redirect: '/jobs?status=open&page=2', expired: '1' })).toBe(
      'redirect=%2Fjobs%3Fstatus%3Dopen%26page%3D2&expired=1',
    );
    expect(stringifyQuery({ q: 'Nguyễn Văn An' })).toBe('q=Nguy%E1%BB%85n%20V%C4%83n%20An');
  });

  it('repeats a key for an array, writes a bare key for null and skips undefined', () => {
    expect(stringifyQuery({ tag: ['a', 'b'], flag: null, gone: undefined })).toBe(
      'tag=a&tag=b&flag',
    );
  });

  it('round-trips through the router', async () => {
    const router = createAppRouter(createMemoryHistory(), false);
    await router.push({ path: '/jobs', query: { q: 'a+b c&d', redirect: '/x?y=1' } });

    expect(router.currentRoute.value.query).toEqual({ q: 'a+b c&d', redirect: '/x?y=1' });
  });
});
