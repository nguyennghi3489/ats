// Better Auth's tables, owned by Better Auth and declared here so drizzle-kit generates their
// migration: the core ones (user, session, account, verification) and the organization plugin's
// (organization = workspace, member, invitation). Property names are the Better Auth field
// names the Drizzle adapter looks up; columns are snake_case. Change them only together with
// `auth.ts` and a new migration.
import { LOCALES, WORKSPACE_ROLES } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /** Interface language (decisions §12): `vi` | `en`. */
    locale: text('locale', { enum: LOCALES }).notNull().default('vi'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check('user_locale_check', sql`${table.locale} in ('vi', 'en')`)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    /** The session cookie carries this token; looking it up here is the only session check. */
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The workspace the session works in (organization plugin); none until one is created or chosen. */
    activeOrganizationId: text('active_organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

/** Sign-in methods of a user: `credential` (email + password hash) now, Google/LinkedIn later. */
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

/** Email verification and password reset tokens. */
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Statuses of a workspace member (decisions §4); members are deactivated, never deleted. */
export const MEMBER_STATUSES = ['active', 'deactivated'] as const;

/**
 * A workspace (Better Auth organization). The slug is generated and never shown: names are not
 * unique. `codePrefix` starts every job code (decisions §5), set once at creation, never updated.
 */
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  codePrefix: text('code_prefix').notNull(),
  createdAt: createdAt(),
});

/** A user's membership of a workspace, with their role (decisions §3) and status (§4). */
export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: WORKSPACE_ROLES }).notNull(),
    status: text('status', { enum: MEMBER_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('member_organization_id_user_id_unique').on(table.organizationId, table.userId),
    index('member_user_id_idx').on(table.userId),
    check('member_role_check', sql`${table.role} in ('admin', 'recruiter', 'collaborator')`),
    check('member_status_check', sql`${table.status} in ('active', 'deactivated')`),
  ],
);

/** An invitation to join a workspace by email (decisions §4; the flow comes in roadmap step 12). */
export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
);

/** The tables handed to Better Auth's Drizzle adapter. */
export const authSchema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
};
