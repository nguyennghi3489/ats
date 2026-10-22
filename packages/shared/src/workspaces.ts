import { z } from 'zod';

/** Roles of a workspace member (decisions §3). The creator of a workspace is its `admin`. */
export const WORKSPACE_ROLES = ['admin', 'recruiter', 'collaborator'] as const;

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Longest workspace name accepted, after trimming. Names are not unique. */
export const WORKSPACE_NAME_MAX_LENGTH = 80;

/** A workspace name: trimmed, 1–80 characters. */
export const workspaceNameSchema = z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH);

/** Most letters a job-code prefix has. */
export const WORKSPACE_PREFIX_MAX_LENGTH = 4;

/** Prefix of a workspace whose name has no Latin letters. */
export const WORKSPACE_PREFIX_FALLBACK = 'WS';

/**
 * The job-code prefix of a new workspace (decisions §5), set once at creation and never edited:
 * diacritics removed (Đ → D), the first letter of each word, uppercase, at most 4 letters. A word
 * is a run of Latin letters. A one-word name uses its first two letters; a name without Latin
 * letters gets `WS`. "An Nhiên" → `AN`, "Hải Đăng Labs" → `HDL`, "Acme" → `AC`.
 */
export function workspacePrefix(name: string): string {
  const latin = name.replace(/[Đđ]/g, 'D').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  const words = latin.match(/[A-Z]+/g) ?? [];
  const [first] = words;
  if (first === undefined) return WORKSPACE_PREFIX_FALLBACK;
  if (words.length === 1) return first.slice(0, 2);
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, WORKSPACE_PREFIX_MAX_LENGTH);
}

/**
 * Header every `POST /api/workspaces` carries: a client-chosen key per creation attempt. A retry
 * with the same key returns the workspace already created instead of creating another.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Body of `POST /api/workspaces`. */
export const createWorkspaceRequestSchema = z.object({ name: workspaceNameSchema });

export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

/**
 * A workspace as the signed-in user sees it, with their role in it. `POST /api/workspaces` answers
 * 201 with it (200 for a retry with the same key), or 400 `VALIDATION_FAILED` /
 * `IDEMPOTENCY_KEY_REQUIRED`, or 401 `UNAUTHENTICATED`.
 */
export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  codePrefix: z.string().min(1),
  role: workspaceRoleSchema,
});

export type Workspace = z.infer<typeof workspaceSchema>;

/**
 * `GET /api/workspaces`: the workspaces the signed-in user is an active member of, sorted by name
 * (Vietnamese collation, case-insensitive), and the session's active one. `activeWorkspaceId` is
 * `null` when none is set or it is no longer an active membership. 401 `UNAUTHENTICATED`.
 */
export const workspaceListSchema = z.object({
  activeWorkspaceId: z.string().min(1).nullable(),
  workspaces: z.array(workspaceSchema),
});

export type WorkspaceList = z.infer<typeof workspaceListSchema>;

/**
 * Body of `PUT /api/workspaces/active`. Answers 200 with the workspace, now the session's active
 * one, or 404 `WORKSPACE_UNAVAILABLE` (unknown, someone else's or a deactivated membership alike),
 * 400 `VALIDATION_FAILED`, 401 `UNAUTHENTICATED`.
 */
export const switchWorkspaceRequestSchema = z.object({ workspaceId: z.string().min(1) });

export type SwitchWorkspaceRequest = z.infer<typeof switchWorkspaceRequestSchema>;

/** Error codes of the `/api/workspaces` endpoints. */
export const WORKSPACE_ERROR_CODES = [
  'VALIDATION_FAILED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'UNAUTHENTICATED',
  'WORKSPACE_UNAVAILABLE',
] as const;

export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];
