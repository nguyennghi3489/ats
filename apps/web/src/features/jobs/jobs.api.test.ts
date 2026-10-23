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
