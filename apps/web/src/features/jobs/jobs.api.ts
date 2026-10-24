/**
 * Job calls of the web app. `GET /api/jobs/:id` answers the job page header, or 404
 * `JOB_NOT_FOUND` for a missing job and a hidden one alike (decisions §3).
 * `POST /api/jobs/:id/status` moves the job along its lifecycle (decisions §5) and answers the
 * new header.
 */
import { type ChangeJobStatusRequest, type JobHeader, jobHeaderSchema } from '@ats/shared';
import { type ApiClient, ApiError, api, CLIENT_ERROR_CODES } from '../../lib/api';

/** The body as a job header, or `UNKNOWN_ERROR` (status 200) when it is not one. */
function parseHeader(body: unknown, route: string): JobHeader {
  const parsed = jobHeaderSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(CLIENT_ERROR_CODES.unknown, 200, `Malformed ${route} response`, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export function createJobsApi(client: ApiClient = api) {
  return {
    /**
     * The header of job `id` as the signed-in user sees it. A job they cannot see throws 404
     * `JOB_NOT_FOUND`; a success body that is not a job header throws `UNKNOWN_ERROR` (status 200).
     */
    async getJob(id: string): Promise<JobHeader> {
      const body = await client.get<unknown>(`/jobs/${encodeURIComponent(id)}`);
      return parseHeader(body, 'GET /api/jobs/:id');
    },

    /**
     * Moves job `id` to `request.to`, sending the `version` the page last loaded. Answers the new
     * header; throws the API code (`FORBIDDEN`, `JOB_NOT_FOUND`, `JOB_STATUS_TRANSITION_INVALID`,
     * `JOB_VERSION_STALE`, `JOB_NOT_READY`, ...) otherwise.
     */
    async changeJobStatus(id: string, request: ChangeJobStatusRequest): Promise<JobHeader> {
      const body = await client.post<unknown>(`/jobs/${encodeURIComponent(id)}/status`, request);
      return parseHeader(body, 'POST /api/jobs/:id/status');
    },
  };
}

export type JobsApi = ReturnType<typeof createJobsApi>;

/** App-wide job calls on the shared API client. */
export const jobsApi = createJobsApi();

/** The header of job `id` (see `JobsApi.getJob`). */
export function getJob(id: string): Promise<JobHeader> {
  return jobsApi.getJob(id);
}

/** Moves job `id` along its lifecycle (see `JobsApi.changeJobStatus`). */
export function changeJobStatus(id: string, request: ChangeJobStatusRequest): Promise<JobHeader> {
  return jobsApi.changeJobStatus(id, request);
}
