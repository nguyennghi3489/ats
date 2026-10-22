import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { useWorkspaceStore } from './workspace.store';

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

const anNhien = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };
const may = { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'recruiter' };

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  setActivePinia(createPinia());
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWorkspaceStore', () => {
  it('starts idle with no workspaces', () => {
    const store = useWorkspaceStore();

    expect(store.status).toBe('idle');
    expect(store.workspaces).toEqual([]);
    expect(store.activeWorkspaceId).toBeNull();
    expect(store.errorCode).toBeNull();
  });

  it('load() reads GET /api/workspaces into workspaces and activeWorkspaceId', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [anNhien, may] }),
    );
    const store = useWorkspaceStore();

    const loading = store.load();
    expect(store.status).toBe('loading');
    await loading;

    const request = requestOf(fetchFn.mock.calls[0]!);
    expect(new URL(request.url).pathname).toBe('/api/workspaces');
    expect(request.method).toBe('GET');
    expect(store.status).toBe('ready');
    expect(store.workspaces).toEqual([anNhien, may]);
    expect(store.activeWorkspaceId).toBe('org_1');
    expect(store.errorCode).toBeNull();
  });

  it('load() reports a body that does not match the schema as an error', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [{ id: 1 }] }),
    );
    const store = useWorkspaceStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.errorCode).toBe('UNKNOWN_ERROR');
    expect(store.workspaces).toEqual([]);
  });

  it('load() reports an API refusal by its code', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR', message: 'Down' }, 503));
    const store = useWorkspaceStore();

    await store.load();

    expect(store.status).toBe('error');
    expect(store.errorCode).toBe('INTERNAL_ERROR');
  });

  it('load() clears the previous error once it succeeds', async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: 'Down' }, 503))
      .mockResolvedValueOnce(jsonResponse({ activeWorkspaceId: null, workspaces: [may] }));
    const store = useWorkspaceStore();

    await store.load();
    await store.load();

    expect(store.status).toBe('ready');
    expect(store.errorCode).toBeNull();
    expect(store.workspaces).toEqual([may]);
  });

  it('select() puts the id to /api/workspaces/active and makes it the active one', async () => {
    fetchFn
      .mockResolvedValueOnce(
        jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [anNhien, may] }),
      )
      .mockResolvedValueOnce(jsonResponse(may));
    const store = useWorkspaceStore();
    await store.load();

    await store.select('org_2');

    const request = requestOf(fetchFn.mock.calls[1]!);
    expect(new URL(request.url).pathname).toBe('/api/workspaces/active');
    expect(request.method).toBe('PUT');
    expect(await request.json()).toEqual({ workspaceId: 'org_2' });
    expect(store.activeWorkspaceId).toBe('org_2');
  });

  it('select() throws the API error and keeps the active workspace', async () => {
    fetchFn
      .mockResolvedValueOnce(
        jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [anNhien, may] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 'WORKSPACE_UNAVAILABLE', message: 'Unavailable' }, 404),
      );
    const store = useWorkspaceStore();
    await store.load();

    const error = await store.select('org_2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('WORKSPACE_UNAVAILABLE');
    expect(store.activeWorkspaceId).toBe('org_1');
  });

  it('reset() forgets the workspaces', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [anNhien] }));
    const store = useWorkspaceStore();
    await store.load();

    store.reset();

    expect(store.status).toBe('idle');
    expect(store.workspaces).toEqual([]);
    expect(store.activeWorkspaceId).toBeNull();
    expect(store.errorCode).toBeNull();
  });
});
