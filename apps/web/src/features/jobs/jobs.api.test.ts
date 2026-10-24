import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../lib/api';
import { createJobsApi } from './jobs.api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const header = {
  id: '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e',
  code: 'AN-001',
  title: 'Product Designer',
  status: 'draft',
  accessScope: 'normal',
  owner: null,
  canEdit: true,
};

function setup(response: () => Response) {
  const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const jobs = createJobsApi(createApiClient({ baseUrl: '/api', fetch: fetchFn }));
  return { fetchFn, jobs };
}

describe('jobsApi.getJob', () => {
  it('reads GET /api/jobs/:id', async () => {
    const { fetchFn, jobs } = setup(() => jsonResponse(header));

    await expect(jobs.getJob(header.id)).resolves.toEqual(header);
    expect(fetchFn.mock.calls[0]![0]).toBe(`/api/jobs/${header.id}`);
    expect(fetchFn.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('encodes the id into the path', async () => {
    const { fetchFn, jobs } = setup(() => jsonResponse({ code: 'JOB_NOT_FOUND' }, 404));

    await jobs.getJob('a/b?c').catch(() => undefined);
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/jobs/a%2Fb%3Fc');
  });

  it('throws JOB_NOT_FOUND for a missing or hidden job', async () => {
    const { jobs } = setup(() => jsonResponse({ code: 'JOB_NOT_FOUND', message: 'x' }, 404));

    const error = await jobs.getJob(header.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('JOB_NOT_FOUND');
    expect((error as ApiError).status).toBe(404);
  });

  it('throws UNKNOWN_ERROR for a body that is not a job header', async () => {
    const { jobs } = setup(() => jsonResponse({ id: header.id }));

    const error = await jobs.getJob(header.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
  });
});

const listBody = {
  items: [
    {
      id: '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e',
      code: 'AN-001',
      title: 'Product Designer',
      status: 'open',
      owner: { id: 'user-1', name: 'Minh Anh' },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
};

describe('jobsApi.listJobs', () => {
  it('reads GET /api/jobs without a query string for the default list', async () => {
    const { fetchFn, jobs } = setup(() => jsonResponse(listBody));

    await expect(jobs.listJobs()).resolves.toEqual(listBody);
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/jobs');
    expect(fetchFn.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('leaves the defaults out: blank search, the active status and page 1', async () => {
    const { fetchFn, jobs } = setup(() => jsonResponse(listBody));

    await jobs.listJobs({ q: '   ', status: 'active', page: 1 });
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/jobs');
  });

  it('sends the trimmed search, the status and the page, encoded', async () => {
    const { fetchFn, jobs } = setup(() => jsonResponse({ ...listBody, page: 2 }));

    await jobs.listJobs({ q: ' thiết kế & co ', status: 'closed', page: 2 });
    const url = new URL(String(fetchFn.mock.calls[0]![0]), 'http://localhost');
    expect(url.pathname).toBe('/api/jobs');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'thiết kế & co',
      status: 'closed',
      page: '2',
    });
  });

  it('throws the API error code, such as VALIDATION_FAILED', async () => {
    const { jobs } = setup(() => jsonResponse({ code: 'VALIDATION_FAILED' }, 400));

    const error = await jobs.listJobs({ page: 1 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');
  });

  it('throws UNKNOWN_ERROR for a body that is not a job list', async () => {
    const { jobs } = setup(() => jsonResponse({ items: [{ id: 'x' }], total: 1 }));

    const error = await jobs.listJobs().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
  });
});
