// Jobs (decisions §5), their stages (§6) and who is assigned to them (§3). Only what the list,
// header, lifecycle and stages need; the job editor fields come with their own migrations.
import { JOB_ACCESS_SCOPES, JOB_STATUSES, type JobLocation } from '@ats/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization, user } from '../auth/auth.schema.js';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * A job of a workspace. `code` is `{PREFIX}-{NNN}`, unique in its workspace, never reused or
 * edited. `ownerUserId` is display only and grants no access; `createdBy` is kept separately and a
 * user it references cannot be deleted. `version` guards against stale edits.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    title: text('title').notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('draft'),
    accessScope: text('access_scope', { enum: JOB_ACCESS_SCOPES }).notNull().default('normal'),
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    /** Country + optional city rows (decisions §5); no Location table. */
    locations: jsonb('locations')
      .$type<JobLocation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    version: integer('version').notNull().default(1),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('jobs_workspace_id_code_unique').on(table.workspaceId, table.code),
    index('jobs_workspace_id_status_idx').on(table.workspaceId, table.status),
    check('jobs_status_check', sql`${table.status} in ('draft', 'open', 'paused', 'closed')`),
    check('jobs_access_scope_check', sql`${table.accessScope} in ('normal', 'restricted')`),
  ],
);

/**
 * The stages of one job, in `position` order (decisions §6). Names are data, renamed per job and
 * never translated per viewer. A stage is retired (`retiredAt`), never deleted.
 */
export const jobStages = pgTable(
  'job_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('job_stages_job_id_position_idx').on(table.jobId, table.position)],
);

/**
 * Members assigned to a job (decisions §3): what collaborators and, on restricted jobs,
 * recruiters can see. Managed in roadmap step 12.
 */
export const jobAssignments = pgTable(
  'job_assignments',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.userId] }),
    index('job_assignments_user_id_idx').on(table.userId),
  ],
);
