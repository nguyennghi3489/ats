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
