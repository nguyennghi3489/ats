/**
 * Thin fetch wrapper for the ATS API.
 *
 * The API answers errors with a `{ code, message }` body (decisions §12). The `code` is what the app
 * branches on and translates; `message` is a developer hint and is never shown to users.
 */
import { translateError } from '../i18n/errors';

/** Client-side codes for failures that never produced an API error body. */
export const CLIENT_ERROR_CODES = {
  /** The request never reached the API or no response came back. */
  network: 'NETWORK_ERROR',
  /** The API answered with an error status but without a `{ code }` body. */
  unknown: 'UNKNOWN_ERROR',
} as const;

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    /** Machine-readable error code, e.g. `WORKSPACE_ACCESS_REVOKED`. */
    readonly code: string,
    /** HTTP status, or 0 when no response was received. */
    readonly status: number,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? code, options);
  }

  /** User-facing text for this error in the active locale; never the raw code or API message. */
  translate(): string {
    return translateError(this.code);
  }
}

/** The code the API answers with (401) when the request has no valid session (decisions §2). */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

export type UnauthenticatedListener = (error: ApiError) => void;

const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/**
 * Calls `listener` whenever any API client gets a 401 `UNAUTHENTICATED`, before the call rejects.
 * The auth guard uses it to end an expired session; returns a function that removes the listener.
 */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

function notifyUnauthenticated(error: ApiError): void {
  for (const listener of unauthenticatedListeners) listener(error);
}

export interface ApiClientOptions {
  /** Prefix for every request path, e.g. `/api` or `https://api.example.com`. */
  baseUrl: string;
  /** Fetch implementation; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export type RequestOptions = Omit<RequestInit, 'body' | 'method'>;

interface ErrorBody {
  code: string;
  message?: string;
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as Record<string, unknown>;
  return (
    typeof code === 'string' &&
    code.length > 0 &&
    (message === undefined || typeof message === 'string')
  );
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    init: RequestOptions = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchFn(joinUrl(options.baseUrl, path), {
        ...init,
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ApiError(CLIENT_ERROR_CODES.network, 0, undefined, { cause });
    }

    const data = await readJson(response);

    if (!response.ok) {
      if (isErrorBody(data)) {
        const error = new ApiError(data.code, response.status, data.message);
        if (error.status === 401 && error.code === UNAUTHENTICATED) notifyUnauthenticated(error);
        throw error;
      }
      throw new ApiError(CLIENT_ERROR_CODES.unknown, response.status);
    }

    return data as T;
  }

  return {
    request,
    get: <T>(path: string, init?: RequestOptions) => request<T>('GET', path, undefined, init),
    post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
      request<T>('POST', path, body, init),
    put: <T>(path: string, body?: unknown, init?: RequestOptions) =>
      request<T>('PUT', path, body, init),
    patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
      request<T>('PATCH', path, body, init),
    delete: <T = void>(path: string, init?: RequestOptions) =>
      request<T>('DELETE', path, undefined, init),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** App-wide client. `VITE_API_URL` overrides the default `/api` (served by the Vite dev proxy). */
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL || '/api' });
