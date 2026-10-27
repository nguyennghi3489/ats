import { z } from 'zod';

/** 401: no session, or an expired or forged one. Every route except `@Public()` ones can answer it. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

/** 403: signed in, but the session has no active workspace and the route needs one. */
export const WORKSPACE_REQUIRED = 'WORKSPACE_REQUIRED';

/**
 * 403: the active workspace is not (or no longer) the user's: no membership, or a deactivated one.
 * The web app clears that workspace's cached data and goes to the workspace chooser (decisions §3).
 */
export const WORKSPACE_ACCESS_REVOKED = 'WORKSPACE_ACCESS_REVOKED';

/** Error codes of the global access guard, which runs before every API route. */
export const ACCESS_ERROR_CODES = [
  UNAUTHENTICATED,
  WORKSPACE_REQUIRED,
  WORKSPACE_ACCESS_REVOKED,
] as const;

export const accessErrorCodeSchema = z.enum(ACCESS_ERROR_CODES);

export type AccessErrorCode = z.infer<typeof accessErrorCodeSchema>;

/**
 * 404: the job does not exist, or exists but the caller may not see it. Hidden records behave
 * exactly like missing ones (decisions §3): same status, same body.
 */
export const JOB_NOT_FOUND = 'JOB_NOT_FOUND';

/** 403: the caller can see the record but its role does not allow the action (e.g. editing). */
export const FORBIDDEN = 'FORBIDDEN';

/** Error codes of the record-level rules of the `access` module. */
export const RECORD_ACCESS_ERROR_CODES = [JOB_NOT_FOUND, FORBIDDEN] as const;

export type RecordAccessErrorCode = (typeof RECORD_ACCESS_ERROR_CODES)[number];

/** 422 / draft check: a stage plan must keep at least one active stage (decisions §6). */
export const STAGE_PLAN_NO_ACTIVE_STAGE = 'STAGE_PLAN_NO_ACTIVE_STAGE';

/** 422 / draft check: a stage name is blank or longer than 100 characters after trimming. */
export const STAGE_NAME_INVALID = 'STAGE_NAME_INVALID';

/** 422 / draft check: a retire target is missing, retired, or the retired stage itself. */
export const STAGE_RETIRE_TARGET_INVALID = 'STAGE_RETIRE_TARGET_INVALID';

/**
 * 422: a stage-plan save does not describe the job's stages: an existing stage is left out or
 * listed twice, a stage `id` is not one of this job's, or a `tempId` repeats.
 */
export const STAGE_PLAN_INVALID = 'STAGE_PLAN_INVALID';

/** Error codes of the stage-plan checks shared by the Quy trình tab and its save endpoint. */
export const STAGE_PLAN_ERROR_CODES = [
  STAGE_PLAN_NO_ACTIVE_STAGE,
  STAGE_NAME_INVALID,
  STAGE_RETIRE_TARGET_INVALID,
] as const;

export type StagePlanErrorCode = (typeof STAGE_PLAN_ERROR_CODES)[number];

/** 409: the lifecycle (decisions §5) does not allow moving the job from its status to the target. */
export const JOB_STATUS_TRANSITION_INVALID = 'JOB_STATUS_TRANSITION_INVALID';

/** 409: the job changed since the caller loaded it (its `version` moved on); reload and retry. */
export const JOB_VERSION_STALE = 'JOB_VERSION_STALE';

/** 409: a Draft job cannot open yet: it needs a title and at least one active stage. */
export const JOB_NOT_READY = 'JOB_NOT_READY';

/** Error codes of `POST /api/jobs/:id/status`, besides the record access ones. */
export const JOB_STATUS_ERROR_CODES = [
  JOB_STATUS_TRANSITION_INVALID,
  JOB_VERSION_STALE,
  JOB_NOT_READY,
] as const;

export type JobStatusErrorCode = (typeof JOB_STATUS_ERROR_CODES)[number];
