import { createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import { createAppRouter, installRouteGuards } from '../../router';
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

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;
let uninstall: () => void;
/** What `GET /api/workspaces` answers, one entry per call; the last one repeats. */
let listAnswers: Answer[];
let switchAnswer: Answer;

const listOf =
  (workspaces: unknown[], activeWorkspaceId: string | null = null): Answer =>
  () =>
    jsonResponse({ activeWorkspaceId, workspaces });

const pathOf = (r: Request) => new URL(r.url, 'http://localhost').pathname;

function requests(): Request[] {
  return fetchFn.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(input, init),
  );
}

const listRequests = () =>
  requests().filter((r) => r.method === 'GET' && pathOf(r) === '/api/workspaces');
const switchRequests = () =>
  requests().filter((r) => r.method === 'PUT' && pathOf(r) === '/api/workspaces/active');

async function open(path: string) {
  await router.push(path);
  await router.isReady();
  return router.currentRoute.value;
}

beforeEach(() => {
  listAnswers = [listOf([])];
  switchAnswer = () => jsonResponse(anNhien);
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = pathOf(request);
    if (path === '/api/me') return jsonResponse({ user });
    if (path === '/api/workspaces' && request.method === 'GET') {
      const answer = listAnswers.length > 1 ? listAnswers.shift()! : listAnswers[0]!;
      return answer();
    }
    if (path === '/api/workspaces/active' && request.method === 'PUT') return switchAnswer();
    return jsonResponse({ code: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  router = createAppRouter(createMemoryHistory(), false);
  uninstall = installRouteGuards(router, pinia);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('workspace guard', () => {
  it('sends a user without workspaces to /welcome', async () => {
    expect((await open('/')).fullPath).toBe('/welcome');
  });

  it('continues when the session has an active workspace', async () => {
    listAnswers = [listOf([anNhien, may], 'org_2')];

    expect((await open('/jobs?status=open')).fullPath).toBe('/jobs?status=open');
    expect(switchRequests()).toHaveLength(0);
  });

  it('selects the only workspace when none is active and continues', async () => {
    listAnswers = [listOf([anNhien])];

    expect((await open('/')).fullPath).toBe('/');
    expect(switchRequests()).toHaveLength(1);
    expect(await switchRequests()[0]!.json()).toEqual({ workspaceId: 'org_1' });
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_1');
  });

  it('sends a user with several workspaces and none active to the chooser with the deep link', async () => {
    listAnswers = [listOf([anNhien, may])];

    const route = await open('/jobs?status=open');

    expect(route.path).toBe('/workspaces');
    expect(route.query.redirect).toBe('/jobs?status=open');
  });

  it('treats an active id that is not in the list as no active workspace', async () => {
    listAnswers = [listOf([anNhien, may], 'org_gone')];

    expect((await open('/')).path).toBe('/workspaces');
  });

  it('falls back to the chooser when the only workspace can no longer be selected', async () => {
    listAnswers = [listOf([anNhien])];
    switchAnswer = () => jsonResponse({ code: 'WORKSPACE_UNAVAILABLE' }, 404);

    const route = await open('/');

    expect(route.path).toBe('/workspaces');
    expect(route.query.redirect).toBe('/');
  });

  it('sends the user to the chooser, which can retry, when the list cannot be loaded', async () => {
    listAnswers = [() => jsonResponse({ code: 'INTERNAL_ERROR' }, 500)];

    expect((await open('/')).path).toBe('/workspaces');
  });

  it('loads the list once while moving between workspace pages', async () => {
    listAnswers = [listOf([anNhien], 'org_1')];
    await open('/');
    await router.push('/jobs');
    await router.push('/candidates');

    expect(listRequests()).toHaveLength(1);
  });

  it('reloads the list when coming back from a setup page, so a new workspace is seen', async () => {
    listAnswers = [listOf([]), listOf([anNhien], 'org_1')];
    expect((await open('/')).fullPath).toBe('/welcome');

    await router.push('/workspaces/new');
    await router.push('/');

    expect(router.currentRoute.value.fullPath).toBe('/');
    expect(listRequests()).toHaveLength(2);
  });

  it.each(['/workspaces', '/workspaces/new', '/workspaces?redirect=%2Fjobs'])(
    'never runs on %s, so there is no redirect loop',
    async (path) => {
      listAnswers = [listOf([anNhien, may])];

      expect((await open(path)).fullPath).toBe(path);
      expect(listRequests()).toHaveLength(0);
    },
  );

  it('shows /welcome to a user without workspaces', async () => {
    expect((await open('/welcome')).fullPath).toBe('/welcome');
  });

  it('sends a user who has a workspace away from /welcome to /', async () => {
    listAnswers = [listOf([anNhien], 'org_1')];

    expect((await open('/welcome')).fullPath).toBe('/');
  });

  it('keeps /welcome when the list cannot be loaded', async () => {
    listAnswers = [() => jsonResponse({ code: 'INTERNAL_ERROR' }, 500)];

    expect((await open('/welcome')).fullPath).toBe('/welcome');
  });

  it('leaves public pages alone', async () => {
    fetchFn.mockImplementation(async () => jsonResponse({ code: 'UNAUTHENTICATED' }, 401));

    expect((await open('/sign-in')).fullPath).toBe('/sign-in');
    expect(listRequests()).toHaveLength(0);
  });

  it('runs after the session guard: a signed-out visitor goes to sign-in, not the chooser', async () => {
    fetchFn.mockImplementation(async () => jsonResponse({ code: 'UNAUTHENTICATED' }, 401));

    expect((await open('/jobs')).fullPath).toBe('/sign-in?redirect=%2Fjobs');
    expect(listRequests()).toHaveLength(0);
  });
});
