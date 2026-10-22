import { createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import { api } from '../../lib/api';
import { createAppRouter, installRouteGuards } from '../../router';
import { clearWorkspaceCache, registerWorkspaceCache } from './workspace-cache';
import { useWorkspaceStore } from './workspace.store';

const user = {
  id: 'user-1',
  name: 'Nguyễn Văn An',
  email: 'an.nguyen@example.test',
  locale: 'vi',
  emailVerified: true,
};

const anNhien = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };
const may = { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'recruiter' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Answer = () => Response;

const listOf =
  (workspaces: unknown[], activeWorkspaceId: string | null = null): Answer =>
  () =>
    jsonResponse({ activeWorkspaceId, workspaces });

const pathOf = (r: Request) => new URL(r.url, 'http://localhost').pathname;

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;
let uninstall: () => void;
/** What `GET /api/workspaces` answers, one entry per call; the last one repeats. */
let listAnswers: Answer[];
/** What any other workspace-scoped call (`/api/jobs`) answers. */
let jobsAnswer: Answer;
const unregister: Array<() => void> = [];

function register(reset: () => void) {
  unregister.push(registerWorkspaceCache(reset));
}

function listRequests(): Request[] {
  return fetchFn.mock.calls
    .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
    .filter((r) => r.method === 'GET' && pathOf(r) === '/api/workspaces');
}

beforeEach(() => {
  listAnswers = [listOf([anNhien, may], 'org_1')];
  jobsAnswer = () => jsonResponse({ jobs: [] });
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = pathOf(request);
    if (path === '/api/me') return jsonResponse({ user });
    if (path === '/api/workspaces' && request.method === 'GET') {
      const answer = listAnswers.length > 1 ? listAnswers.shift()! : listAnswers[0]!;
      return answer();
    }
    if (path === '/api/jobs') return jobsAnswer();
    return jsonResponse({ code: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  router = createAppRouter(createMemoryHistory(), false);
  uninstall = installRouteGuards(router, pinia);
});

afterEach(() => {
  uninstall();
  while (unregister.length > 0) unregister.pop()!();
  vi.unstubAllGlobals();
});

/** Signed in and on `/jobs` of workspace An Nhiên; then the list loses it (or every workspace). */
async function onJobsThenRevoked(remaining: unknown[]) {
  await router.push('/jobs');
  await router.isReady();
  expect(router.currentRoute.value.fullPath).toBe('/jobs');
  listAnswers = [listOf(remaining, null)];
}

/** Counts finished navigations from here on. */
function countNavigations(): () => number {
  let count = 0;
  router.afterEach((_to, _from, failure) => {
    if (!failure) count++;
  });
  return () => count;
}

const revoked =
  (code = 'WORKSPACE_ACCESS_REVOKED'): Answer =>
  () =>
    jsonResponse({ code }, 403);

describe('clearWorkspaceCache', () => {
  it('calls every registered reset() once and resets the workspace store', async () => {
    const resets = [vi.fn(), vi.fn(), vi.fn()];
    for (const reset of resets) register(reset);
    const store = useWorkspaceStore(pinia);
    await store.load();
    expect(store.status).toBe('ready');

    clearWorkspaceCache(pinia);

    for (const reset of resets) expect(reset).toHaveBeenCalledOnce();
    expect(store.status).toBe('idle');
    expect(store.workspaces).toEqual([]);
    expect(store.activeWorkspaceId).toBeNull();
  });

  it('no longer calls a reset() once it is unregistered', () => {
    const reset = vi.fn();
    registerWorkspaceCache(reset)();

    clearWorkspaceCache(pinia);

    expect(reset).not.toHaveBeenCalled();
  });
});

describe('revoked workspace access', () => {
  it('three parallel 403 WORKSPACE_ACCESS_REVOKED answers clear the cache and navigate once to the chooser', async () => {
    const reset = vi.fn();
    register(reset);
    await onJobsThenRevoked([may]);
    const navigations = countNavigations();
    const listsBefore = listRequests().length;
    jobsAnswer = revoked();

    await Promise.all([1, 2, 3].map(() => api.get('/jobs').catch(() => undefined)));

    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/workspaces?revoked=1'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(navigations()).toBe(1);
    expect(reset).toHaveBeenCalledOnce();
    expect(listRequests().length - listsBefore).toBe(1);
    const store = useWorkspaceStore(pinia);
    expect(store.workspaces.map((w) => w.id)).toEqual(['org_2']);
    expect(store.activeWorkspaceId).toBeNull();
  });

  it('sends a user with no workspace left to /welcome', async () => {
    const reset = vi.fn();
    register(reset);
    await onJobsThenRevoked([]);
    jobsAnswer = revoked();

    await api.get('/jobs').catch(() => undefined);

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/welcome'));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('handles 403 WORKSPACE_REQUIRED the same way', async () => {
    await onJobsThenRevoked([may]);
    jobsAnswer = revoked('WORKSPACE_REQUIRED');

    await api.get('/jobs').catch(() => undefined);

    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/workspaces?revoked=1'),
    );
  });

  it('handles a later revocation again after the first one has settled', async () => {
    await onJobsThenRevoked([may]);
    jobsAnswer = revoked();
    await api.get('/jobs').catch(() => undefined);
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/workspaces?revoked=1'),
    );

    listAnswers = [listOf([may], 'org_2')];
    await router.push('/jobs');
    expect(router.currentRoute.value.fullPath).toBe('/jobs');
    listAnswers = [listOf([], null)];
    await api.get('/jobs').catch(() => undefined);

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/welcome'));
  });

  it.each([
    ['another 403 code', () => jsonResponse({ code: 'FORBIDDEN' }, 403)],
    ['a 403 role refusal', () => jsonResponse({ code: 'ROLE_NOT_ALLOWED' }, 403)],
    ['a 403 without a code', () => new Response('', { status: 403 })],
    ['a 404', () => jsonResponse({ code: 'JOB_NOT_FOUND' }, 404)],
  ])('ignores %s', async (_label, answer) => {
    const reset = vi.fn();
    register(reset);
    await onJobsThenRevoked([may]);
    const listsBefore = listRequests().length;
    jobsAnswer = answer;

    await api.get('/jobs').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(router.currentRoute.value.fullPath).toBe('/jobs');
    expect(reset).not.toHaveBeenCalled();
    expect(listRequests().length).toBe(listsBefore);
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_1');
  });
});
