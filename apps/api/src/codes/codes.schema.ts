import { CODE_KINDS } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { organization } from '../auth/auth.schema.js';

/**
 * The last number handed out per workspace and kind (decisions §5). `CodesService.nextCode`
 * increments it inside the transaction that inserts the coded record; rows are never decremented.
 */
export const workspaceCounters = pgTable(
  'workspace_counters',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CODE_KINDS }).notNull(),
    lastValue: integer('last_value').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.kind] }),
    check('workspace_counters_kind_check', sql`${table.kind} in ('job', 'application')`),
    check('workspace_counters_last_value_check', sql`${table.lastValue} >= 1`),
  ],
);
