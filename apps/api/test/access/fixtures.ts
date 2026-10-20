import { randomBytes, randomUUID } from 'node:crypto';
import type { WorkspaceRole } from '@ats/shared';
import { member, organization, session, user } from '../../src/auth/auth.schema.js';
import type { DatabaseClient } from '../../src/database/database.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Synthetic rows for access tests, written straight to the test database. */
export function accessFixtures(db: DatabaseClient) {
  return {
    async user(email = `${randomUUID()}@example.test`) {
      const id = randomUUID();
      await db.insert(user).values({ id, name: 'Lan Test', email, emailVerified: true });
      return { id, email };
    },

    async workspace(name = 'Mây Studio') {
      const id = randomUUID();
      await db.insert(organization).values({ id, name, slug: id, codePrefix: 'MS' });
      return id;
    },

    async member(
      workspaceId: string,
      userId: string,
      role: WorkspaceRole = 'recruiter',
      status: 'active' | 'deactivated' = 'active',
    ) {
      await db
        .insert(member)
        .values({ id: randomUUID(), organizationId: workspaceId, userId, role, status });
    },

    /** A session row; returns its token (the value the session cookie carries, unsigned). */
    async session(
      userId: string,
      options: { activeWorkspaceId?: string | null; expiresAt?: Date } = {},
    ): Promise<string> {
      const token = randomBytes(24).toString('base64url');
      await db.insert(session).values({
        id: randomUUID(),
        token,
        userId,
        expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * DAY_MS),
        activeOrganizationId: options.activeWorkspaceId ?? null,
      });
      return token;
    },
  };
}
