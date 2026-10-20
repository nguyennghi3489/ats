import { randomUUID } from 'node:crypto';
import { type Workspace, type WorkspaceList, workspacePrefix } from '@ats/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { member, organization, session } from '../auth/auth.schema.js';
import type { Database, Transaction } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { workspaceCreation } from './workspaces.schema.js';

export interface CreateWorkspaceInput {
  userId: string;
  /** Token of the caller's session, which gets the workspace as its active one. */
  sessionToken: string;
  /** Already validated with `workspaceNameSchema` (trimmed). */
  name: string;
  idempotencyKey: string;
}

export interface CreateWorkspaceResult {
  workspace: Workspace;
  /** `false` when the key was used before and `workspace` is the one created then. */
  created: boolean;
}

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * Creates a workspace (Better Auth organization) with its fixed code prefix and the caller as
   * active admin, records it under the idempotency key and makes it the session's active workspace,
   * all in one transaction. The same key from the same user returns the workspace created the first
   * time (and makes it active again); attempts with the same key wait for each other.
   */
  create(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`workspace-creation:${input.userId}:${input.idempotencyKey}`}, 0))`,
      );
      const existing = await findCreated(tx, input.userId, input.idempotencyKey);
      if (existing) {
        await setActive(tx, input.sessionToken, existing.id);
        return { workspace: existing, created: false };
      }

      const id = randomUUID();
      const codePrefix = workspacePrefix(input.name);
      // Names are not unique, so the slug Better Auth requires is generated and never shown.
      await tx.insert(organization).values({ id, name: input.name, slug: id, codePrefix });
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId: id,
        userId: input.userId,
        role: 'admin',
        status: 'active',
      });
      await tx.insert(workspaceCreation).values({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        organizationId: id,
      });
      await setActive(tx, input.sessionToken, id);
      return { workspace: { id, name: input.name, codePrefix, role: 'admin' }, created: true };
    });
  }

  /**
   * The workspaces `userId` is an active member of, sorted by name (Vietnamese, case-insensitive),
   * and `activeWorkspaceId` when it is one of them, else `null` (deactivated or never set).
   */
  async list(userId: string, activeWorkspaceId: string | null | undefined): Promise<WorkspaceList> {
    const workspaces = await this.database.db
      .select(workspaceColumns)
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(activeMembership(userId))
      .orderBy(
        sql`lower(${organization.name} collate "vi-x-icu") collate "vi-x-icu"`,
        asc(organization.id),
      );
    const active = workspaces.some((workspace) => workspace.id === activeWorkspaceId)
      ? (activeWorkspaceId ?? null)
      : null;
    return { activeWorkspaceId: active, workspaces };
  }

  /**
   * Makes `workspaceId` the active workspace of the session with `sessionToken` when `userId` is an
   * active member of it, and returns it. `undefined` when it is unknown, someone else's or a
   * deactivated membership: callers answer all three alike.
   */
  switchActive(
    userId: string,
    sessionToken: string,
    workspaceId: string,
  ): Promise<Workspace | undefined> {
    return this.database.transaction(async (tx) => {
      const [workspace] = await tx
        .select(workspaceColumns)
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(and(activeMembership(userId), eq(member.organizationId, workspaceId)));
      if (!workspace) return undefined;
      await setActive(tx, sessionToken, workspace.id);
      return workspace;
    });
  }
}

/** A workspace with the member's role in it, from `member` joined to `organization`. */
const workspaceColumns = {
  id: organization.id,
  name: organization.name,
  codePrefix: organization.codePrefix,
  role: member.role,
};

/** Memberships of `userId` that still grant access (decisions §4). */
function activeMembership(userId: string) {
  return and(eq(member.userId, userId), eq(member.status, 'active'));
}

/** The workspace `userId` created with `idempotencyKey`, with their role in it, if any. */
async function findCreated(
  tx: Transaction,
  userId: string,
  idempotencyKey: string,
): Promise<Workspace | undefined> {
  const [row] = await tx
    .select({
      id: organization.id,
      name: organization.name,
      codePrefix: organization.codePrefix,
      role: member.role,
    })
    .from(workspaceCreation)
    .innerJoin(organization, eq(organization.id, workspaceCreation.organizationId))
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, workspaceCreation.userId)),
    )
    .where(
      and(
        eq(workspaceCreation.userId, userId),
        eq(workspaceCreation.idempotencyKey, idempotencyKey),
      ),
    );
  return row;
}

async function setActive(tx: Transaction, sessionToken: string, workspaceId: string) {
  await tx
    .update(session)
    .set({ activeOrganizationId: workspaceId })
    .where(eq(session.token, sessionToken));
}
