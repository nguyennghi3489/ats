import {
  DEFAULT_LOCALE,
  type Locale,
  UNAUTHENTICATED,
  WORKSPACE_ACCESS_REVOKED,
  WORKSPACE_REQUIRED,
  type WorkspaceRole,
} from '@ats/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import { member, session, user } from '../auth/auth.schema.js';
import type { DatabaseClient } from '../database/database.js';

/** The signed-in user, as every route sees them. */
export interface AccessUser {
  id: string;
  name: string;
  email: string;
  locale: Locale;
  emailVerified: boolean;
}

/** Who calls a route that needs a workspace: an active member of it, with their role. */
export interface WorkspaceActor {
  user: AccessUser;
  /** Token of the request's session (server-side only; never returned to the client). */
  sessionToken: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/** Who calls a `@SessionOnly()` route without a usable workspace. */
export interface SessionActor {
  user: AccessUser;
  sessionToken: string;
  workspaceId: null;
  role?: undefined;
}

export type Actor = WorkspaceActor | SessionActor;

export type AccessResult =
  | { ok: true; actor: WorkspaceActor }
  | { ok: false; code: typeof UNAUTHENTICATED }
  /** Signed in, but without (access to) a workspace; `actor` serves `@SessionOnly()` routes. */
  | {
      ok: false;
      code: typeof WORKSPACE_REQUIRED | typeof WORKSPACE_ACCESS_REVOKED;
      actor: SessionActor;
    };

/**
 * The single place access is resolved (decisions §3): one SQL statement reads the session, its
 * user and their membership of the workspace, so a Redis cache can wrap it later without touching
 * callers. No cache in v1: deactivation and role changes apply on the next request.
 *
 * `workspaceId` is the workspace to check; `null` means the session's active workspace.
 * An unknown or expired session is `UNAUTHENTICATED`; no workspace is `WORKSPACE_REQUIRED`; no
 * membership or a deactivated one is `WORKSPACE_ACCESS_REVOKED`.
 */
export async function resolveAccess(
  db: DatabaseClient,
  sessionToken: string,
  workspaceId: string | null,
): Promise<AccessResult> {
  const targetWorkspace = sql<
    string | null
  >`coalesce(${workspaceId}::text, ${session.activeOrganizationId})`;
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      emailVerified: user.emailVerified,
      workspaceId: targetWorkspace,
      role: member.role,
      status: member.status,
    })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .leftJoin(
      member,
      and(eq(member.userId, session.userId), eq(member.organizationId, targetWorkspace)),
    )
    // The app clock, not Postgres's: same rule as Better Auth, which compares in JavaScript.
    .where(and(eq(session.token, sessionToken), gt(session.expiresAt, new Date())));

  if (!row) return { ok: false, code: UNAUTHENTICATED };
  const accessUser: AccessUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    locale: row.locale ?? DEFAULT_LOCALE,
    emailVerified: row.emailVerified,
  };
  const sessionActor: SessionActor = { user: accessUser, sessionToken, workspaceId: null };
  if (row.workspaceId === null) return { ok: false, code: WORKSPACE_REQUIRED, actor: sessionActor };
  if (row.role === null || row.status !== 'active') {
    return { ok: false, code: WORKSPACE_ACCESS_REVOKED, actor: sessionActor };
  }
  return {
    ok: true,
    actor: { user: accessUser, sessionToken, workspaceId: row.workspaceId, role: row.role },
  };
}
