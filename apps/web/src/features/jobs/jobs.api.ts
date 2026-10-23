/**
 * Job calls of the web app. `GET /api/jobs/:id` answers the job page header, or 404
 * `JOB_NOT_FOUND` for a missing job and a hidden one alike (decisions §3).
 */
import { type JobHeader, jobHeaderSchema } from '@ats/shared';
import { type ApiClient, ApiError, api, CLIENT_ERROR_CODES } from '../../lib/api';

export function createJobsApi(client: ApiClient = api) {
  return {
    /**
     * The header of job `id` as the signed-in user sees it. A job they cannot see throws 404
     * `JOB_NOT_FOUND`; a success body that is not a job header throws `UNKNOWN_ERROR` (status 200).
     */
    async getJob(id: string): Promise<JobHeader> {
      const body = await client.get<unknown>(`/jobs/${encodeURIComponent(id)}`);
      const parsed = jobHeaderSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError(
          CLIENT_ERROR_CODES.unknown,
          200,
          'Malformed GET /api/jobs/:id response',
          {
            cause: parsed.error,
          },
        );
      }
      return parsed.data;
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
