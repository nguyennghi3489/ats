import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../../lib/api';
import { createStagesApi } from './stages.api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const jobId = '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e';

const stages = {
  jobId,
  version: 2,
  canEdit: false,
  active: [
    { id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c01', name: 'New', position: 1 },
    { id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c02', name: 'Screening', position: 2 },
  ],
  retired: [
    {
      id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c09',
      name: 'Portfolio review',
      retiredAt: '2026-10-20T08:30:00.000Z',
    },
  ],
};

function setup(response: () => Response) {
  const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => response());
  const api = createStagesApi(createApiClient({ baseUrl: '/api', fetch: fetchFn }));
  return { fetchFn, api };
}

describe('stagesApi.getJobStages', () => {
  it('reads GET /api/jobs/:id/stages', async () => {
    const { fetchFn, api } = setup(() => jsonResponse(stages));

    await expect(api.getJobStages(jobId)).resolves.toEqual(stages);
    expect(fetchFn.mock.calls[0]![0]).toBe(`/api/jobs/${jobId}/stages`);
    expect(fetchFn.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('encodes the id into the path', async () => {
    const { fetchFn, api } = setup(() => jsonResponse({ code: 'JOB_NOT_FOUND' }, 404));

    await api.getJobStages('a/b?c').catch(() => undefined);
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/jobs/a%2Fb%3Fc/stages');
  });

  it('throws JOB_NOT_FOUND for a missing or hidden job', async () => {
    const { api } = setup(() => jsonResponse({ code: 'JOB_NOT_FOUND', message: 'x' }, 404));

    const error = await api.getJobStages(jobId).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('JOB_NOT_FOUND');
    expect((error as ApiError).status).toBe(404);
  });

  it('throws UNKNOWN_ERROR for a body that is not a stages response', async () => {
    const { api } = setup(() => jsonResponse({ ...stages, active: [{ id: 'x', position: 1 }] }));

    const error = await api.getJobStages(jobId).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
    expect((error as ApiError).status).toBe(200);
  });
});
