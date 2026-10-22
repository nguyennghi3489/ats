import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import en from '../i18n/locales/en.json';
import viMessages from '../i18n/locales/vi.json';
import { ApiError, createApiClient, onUnauthenticated, onWorkspaceAccessRevoked } from './api';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('prefixes the base URL and always sends credentials', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const api = createApiClient({ baseUrl: 'https://api.example.test/api/', fetch: fetchFn });

    await api.get('/jobs');

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/jobs');
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('GET');
  });

  it('returns the parsed JSON body on success', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'AN-001' }, 200));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    await expect(api.get<{ id: string }>('/jobs/AN-001')).resolves.toEqual({ id: 'AN-001' });
  });

  it('sends a JSON body with a content type', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'AN-002' }, 201));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    await api.post('/jobs', { title: 'Kỹ sư' });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/jobs');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ title: 'Kỹ sư' }));
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });

  it('returns undefined for 204 No Content', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    await expect(api.delete('/jobs/AN-001')).resolves.toBeUndefined();
  });

  it('turns a { code, message } error body into a typed ApiError', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ code: 'WORKSPACE_ACCESS_REVOKED', message: 'Access revoked' }, 403),
      );
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    const error = await api.get('/jobs').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'WORKSPACE_ACCESS_REVOKED',
      message: 'Access revoked',
      status: 403,
    });
  });

  it('keeps the code when the error body has no message', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ code: 'JOB_NOT_FOUND' }, 404));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    await expect(api.get('/jobs/AN-999')).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
      status: 404,
    });
  });

  it('falls back to UNKNOWN_ERROR when the error body is not a { code } object', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    const error = await api.get('/jobs').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UNKNOWN_ERROR', status: 502 });
  });

  it('ignores a non-string code in the error body', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: 42 }, 400));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    await expect(api.get('/jobs')).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', status: 400 });
  });

  it('reports a network failure as NETWORK_ERROR with status 0', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    const error = await api.get('/jobs').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});

describe('onUnauthenticated', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('tells listeners about a 401 UNAUTHENTICATED and still rejects the call', async () => {
    const listener = vi.fn();
    stop = onUnauthenticated(listener);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ code: 'UNAUTHENTICATED', message: 'Session expired' }, 401),
      );
    const api = createApiClient({ baseUrl: '/api', fetch: fetchFn });

    const error = await api.get('/jobs').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(error);
  });

  it.each([
    ['another 401 code', jsonResponse({ code: 'INVALID_EMAIL_OR_PASSWORD' }, 401)],
    ['a 403', jsonResponse({ code: 'UNAUTHENTICATED' }, 403)],
    ['a 401 without a code', new Response('', { status: 401 })],
    ['a success', jsonResponse({ ok: true }, 200)],
  ])('stays quiet for %s', async (_label, response) => {
    const listener = vi.fn();
    stop = onUnauthenticated(listener);
    const api = createApiClient({
      baseUrl: '/api',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await api.get('/jobs').catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops calling a listener once it is removed', async () => {
    const listener = vi.fn();
    onUnauthenticated(listener)();
    const api = createApiClient({
      baseUrl: '/api',
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED' }, 401)),
    });

    await api.get('/jobs').catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('onWorkspaceAccessRevoked', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it.each(['WORKSPACE_ACCESS_REVOKED', 'WORKSPACE_REQUIRED'])(
    'tells listeners about a 403 %s and still rejects the call',
    async (code) => {
      const listener = vi.fn();
      stop = onWorkspaceAccessRevoked(listener);
      const api = createApiClient({
        baseUrl: '/api',
        fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code }, 403)),
      });

      const error = await api.get('/jobs').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code, status: 403 });
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(error);
    },
  );

  it.each([
    ['another 403 code', jsonResponse({ code: 'FORBIDDEN' }, 403)],
    ['a 403 role refusal', jsonResponse({ code: 'ROLE_NOT_ALLOWED' }, 403)],
    ['the code with another status', jsonResponse({ code: 'WORKSPACE_ACCESS_REVOKED' }, 404)],
    ['a 403 without a code', new Response('', { status: 403 })],
    ['a 401 UNAUTHENTICATED', jsonResponse({ code: 'UNAUTHENTICATED' }, 401)],
    ['a success', jsonResponse({ ok: true }, 200)],
  ])('stays quiet for %s', async (_label, response) => {
    const listener = vi.fn();
    stop = onWorkspaceAccessRevoked(listener);
    const api = createApiClient({
      baseUrl: '/api',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await api.get('/jobs').catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops calling a listener once it is removed', async () => {
    const listener = vi.fn();
    onWorkspaceAccessRevoked(listener)();
    const api = createApiClient({
      baseUrl: '/api',
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ code: 'WORKSPACE_ACCESS_REVOKED' }, 403)),
    });

    await api.get('/jobs').catch(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ApiError.translate', () => {
  it('shows the translated message for a known code in the active locale', () => {
    const error = new ApiError('NETWORK_ERROR', 0);

    setLocale('vi');
    expect(error.translate()).toBe(viMessages.errors.NETWORK_ERROR);
    setLocale('en');
    expect(error.translate()).toBe(en.errors.NETWORK_ERROR);
  });

  it('shows errors.unknown for a code the app does not know, never the raw code or message', () => {
    setLocale('en');
    const error = new ApiError('SOME_FUTURE_CODE', 409, 'Developer hint');

    expect(error.translate()).toBe(en.errors.unknown);
    expect(error.translate()).not.toContain('SOME_FUTURE_CODE');
    expect(error.translate()).not.toContain('Developer hint');
  });
});
