import { primaryKey, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization, user } from '../auth/auth.schema.js';

/**
 * Which workspace each `POST /api/workspaces` created, by user and `Idempotency-Key`: a retry with
 * the same key returns that workspace instead of creating a second one.
 */
export const workspaceCreation = pgTable(
  'workspace_creation',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.idempotencyKey] })],
);
