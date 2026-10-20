import { describe, expect, it, vi } from 'vitest';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { authBaseUrl, createAuthApi } from './auth-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** URL, method and parsed JSON body of the n-th fetch call, however Better Fetch passed them. */
async function callAt(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [input, init] = fetchFn.mock.calls[index]!;
  const request = input instanceof Request ? input : new Request(input, init);
  const text = await request.clone().text();
  return {
    url: request.url,
    method: request.method,
    credentials: init?.credentials ?? request.credentials,
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

function setup(response: Response | Error) {
  const fetchFn = vi.fn<typeof fetch>();
  if (response instanceof Error) fetchFn.mockRejectedValue(response);
  else fetchFn.mockResolvedValue(response);
  const auth = createAuthApi({
    baseUrl: 'https://api.example.test/api',
    origin: 'https://app.example.test',
    fetch: fetchFn,
  });
  return { auth, fetchFn };
}

describe('authBaseUrl', () => {
  it('serves Better Auth under /auth of the API base, resolved against the page origin', () => {
    expect(authBaseUrl('/api', 'http://localhost:5173')).toBe('http://localhost:5173/api/auth');
    expect(authBaseUrl('/api/', 'http://localhost:5173')).toBe('http://localhost:5173/api/auth');
  });

  it('keeps an absolute VITE_API_URL as it is', () => {
    expect(authBaseUrl('https://api.example.test/api', 'http://localhost:5173')).toBe(
      'https://api.example.test/api/auth',
    );
  });
});

describe('createAuthApi', () => {
  it('signs in with email and password at /api/auth/sign-in/email, sending cookies', async () => {
    const { auth, fetchFn } = setup(
      jsonResponse({ redirect: false, token: 'tok', user: { id: 'u1' } }),
    );

    await auth.signIn({ email: 'an.nguyen@example.test', password: 'synthetic-pass-1' });

    expect(fetchFn).toHaveBeenCalledOnce();
    const call = await callAt(fetchFn);
    expect(call.url).toBe('https://api.example.test/api/auth/sign-in/email');
    expect(call.method).toBe('POST');
    expect(call.credentials).toBe('include');
    expect(call.body).toMatchObject({
      email: 'an.nguyen@example.test',
      password: 'synthetic-pass-1',
    });
  });

  it('signs up with name, email, password and locale', async () => {
    const { auth, fetchFn } = setup(jsonResponse({ token: null, user: { id: 'u1' } }));

    await auth.signUp({
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@example.test',
      password: 'synthetic-pass-1',
      locale: 'en',
    });

    const call = await callAt(fetchFn);
    expect(call.url).toBe('https://api.example.test/api/auth/sign-up/email');
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({
      name: 'Nguyễn Văn An',
      email: 'an.nguyen@example.test',
      password: 'synthetic-pass-1',
      locale: 'en',
    });
  });

  it('signs out with POST /api/auth/sign-out', async () => {
    const { auth, fetchFn } = setup(jsonResponse({ success: true }));

    await auth.signOut();

    const call = await callAt(fetchFn);
    expect(call.url).toBe('https://api.example.test/api/auth/sign-out');
    expect(call.method).toBe('POST');
    expect(call.credentials).toBe('include');
  });

  it('requests a password reset email with POST /api/auth/request-password-reset', async () => {
    const { auth, fetchFn } = setup(jsonResponse({ status: true }));

    await auth.requestPasswordReset({ email: 'an.nguyen@example.test' });

    expect(fetchFn).toHaveBeenCalledOnce();
    const call = await callAt(fetchFn);
    expect(call.url).toBe('https://api.example.test/api/auth/request-password-reset');
    expect(call.method).toBe('POST');
    expect(call.credentials).toBe('include');
    expect(call.body).toEqual({ email: 'an.nguyen@example.test' });
  });

  it('surfaces a refused reset request with its code and retryAfterSeconds', async () => {
    const { auth } = setup(
      jsonResponse({ code: 'RESEND_LIMIT', message: 'RESEND_LIMIT', retryAfterSeconds: 1800 }, 429),
    );

    const error = await auth
      .requestPasswordReset({ email: 'an.nguyen@example.test' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'RESEND_LIMIT', status: 429 });
    expect((error as ApiError).cause).toMatchObject({ retryAfterSeconds: 1800 });
  });

  it('surfaces a Better Auth error response as ApiError with the API code and status', async () => {
    const { auth } = setup(
      jsonResponse(
        { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        401,
      ),
    );

    const error = await auth
      .signIn({ email: 'an.nguyen@example.test', password: 'wrong-pass-1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 });
  });

  it('keeps the error body as the cause, so screens can read fields such as retryAfterSeconds', async () => {
    const { auth } = setup(
      jsonResponse(
        { code: 'SIGN_IN_RATE_LIMITED', message: 'Too many', retryAfterSeconds: 600 },
        429,
      ),
    );

    const error = await auth
      .signIn({ email: 'an.nguyen@example.test', password: 'wrong-pass-1' })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'SIGN_IN_RATE_LIMITED', status: 429 });
    expect((error as ApiError).cause).toMatchObject({ retryAfterSeconds: 600 });
  });

  it('maps an error status without a code to UNKNOWN_ERROR', async () => {
    const { auth } = setup(new Response('', { status: 500 }));

    const error = await auth.signOut().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODES.unknown, status: 500 });
  });

  it('maps a request that never got an answer to NETWORK_ERROR', async () => {
    const { auth } = setup(new TypeError('Failed to fetch'));

    const error = await auth.signOut().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODES.network, status: 0 });
  });
});
