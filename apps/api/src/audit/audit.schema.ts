import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organization, user } from '../auth/auth.schema.js';

const inList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * Append-only log of sensitive actions (decisions §13), written by `AuditService.record` inside the
 * transaction of the change itself. Rows are never updated or deleted by the application; metadata
 * holds only ids, enums, counts and timestamps (no personal data, no Claude content).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Who did it; `null` for system actions, or once the user row is gone. */
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    targetType: text('target_type', { enum: AUDIT_TARGET_TYPES }).notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_workspace_id_created_at_idx').on(table.workspaceId, table.createdAt),
    check('audit_log_action_check', sql`${table.action} in (${inList(AUDIT_ACTIONS)})`),
    check(
      'audit_log_target_type_check',
      sql`${table.targetType} in (${inList(AUDIT_TARGET_TYPES)})`,
    ),
  ],
);
