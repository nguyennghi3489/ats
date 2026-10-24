/**
 * Stage calls of the web app. `GET /api/jobs/:id/stages` answers the job's active and retired
 * stages with its `version` and `canEdit`, or 404 `JOB_NOT_FOUND` for a missing job and a hidden
 * one alike (decisions §3, §6).
 */
import { type JobStages, jobStagesSchema } from '@ats/shared';
import { type ApiClient, ApiError, api, CLIENT_ERROR_CODES } from '../../lib/api';

export function createStagesApi(client: ApiClient = api) {
  return {
    /**
     * The stages of job `id` as the signed-in user sees them. A job they cannot see throws 404
     * `JOB_NOT_FOUND`; a success body that is not a stages response throws `UNKNOWN_ERROR`
     * (status 200).
     */
    async getJobStages(id: string): Promise<JobStages> {
      const body = await client.get<unknown>(`/jobs/${encodeURIComponent(id)}/stages`);
      const parsed = jobStagesSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError(
          CLIENT_ERROR_CODES.unknown,
          200,
          'Malformed GET /api/jobs/:id/stages response',
          { cause: parsed.error },
        );
      }
      return parsed.data;
    },
  };
}

export type StagesApi = ReturnType<typeof createStagesApi>;

/** App-wide stage calls on the shared API client. */
export const stagesApi = createStagesApi();

/** The stages of job `id` (see `StagesApi.getJobStages`). */
export function getJobStages(id: string): Promise<JobStages> {
  return stagesApi.getJobStages(id);
}
