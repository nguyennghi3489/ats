import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../lib/api';
import { createWorkspacesApi } from './workspaces.api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const workspace = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };

function setup(response: () => Response | Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const workspaces = createWorkspacesApi(createApiClient({ baseUrl: '/api', fetch: fetchFn }));
  return { fetchFn, workspaces };
}

describe('workspacesApi.create', () => {
  it('posts the name to /api/workspaces with the Idempotency-Key header', async () => {
    const { fetchFn, workspaces } = setup(() => jsonResponse(workspace, 201));

    await expect(workspaces.create('An Nhiên', 'key-1')).resolves.toEqual(workspace);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/workspaces');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'An Nhiên' }));
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('key-1');
  });

  it('throws the API error code', async () => {
    const { workspaces } = setup(() =>
      jsonResponse({ code: 'VALIDATION_FAILED', message: 'Invalid workspace name' }, 400),
    );

    const error = await workspaces.create('x', 'key-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');
  });

  it('throws UNKNOWN_ERROR for a success body that is not a workspace', async () => {
    const { workspaces } = setup(() => jsonResponse({ ok: true }, 201));

    const error = await workspaces.create('An Nhiên', 'key-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
    expect((error as ApiError).status).toBe(200);
  });
});

describe('workspacesApi.list', () => {
  it('reads the workspaces of GET /api/workspaces', async () => {
    const { fetchFn, workspaces } = setup(() =>
      jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [workspace] }),
    );

    await expect(workspaces.list()).resolves.toEqual([workspace]);
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/workspaces');
    expect(fetchFn.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('throws UNKNOWN_ERROR for a body without a workspace list', async () => {
    const { workspaces } = setup(() => jsonResponse({ activeWorkspaceId: null }));

    const error = await workspaces.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
  });
});

describe('workspacesApi.getList', () => {
  it('reads the workspaces and the active one of GET /api/workspaces', async () => {
    const { workspaces } = setup(() =>
      jsonResponse({ activeWorkspaceId: 'org_1', workspaces: [{ ...workspace, extra: 'x' }] }),
    );

    await expect(workspaces.getList()).resolves.toEqual({
      activeWorkspaceId: 'org_1',
      workspaces: [workspace],
    });
  });

  it('throws UNKNOWN_ERROR for a body that does not match the schema', async () => {
    const { workspaces } = setup(() => jsonResponse({ workspaces: [{ id: 'org_1' }] }));

    const error = await workspaces.getList().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
    expect((error as ApiError).status).toBe(200);
  });
});

describe('workspacesApi.switch', () => {
  it('puts the workspace id to /api/workspaces/active and returns the workspace', async () => {
    const { fetchFn, workspaces } = setup(() => jsonResponse(workspace));

    await expect(workspaces.switch('org_1')).resolves.toEqual(workspace);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/workspaces/active');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify({ workspaceId: 'org_1' }));
  });

  it('throws WORKSPACE_UNAVAILABLE from a 404', async () => {
    const { workspaces } = setup(() =>
      jsonResponse({ code: 'WORKSPACE_UNAVAILABLE', message: 'Unavailable' }, 404),
    );

    const error = await workspaces.switch('org_9').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('WORKSPACE_UNAVAILABLE');
  });

  it('throws UNKNOWN_ERROR for a success body that is not a workspace', async () => {
    const { workspaces } = setup(() => jsonResponse({ ok: true }));

    const error = await workspaces.switch('org_1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
  });
});
