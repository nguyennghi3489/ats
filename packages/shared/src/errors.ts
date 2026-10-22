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
