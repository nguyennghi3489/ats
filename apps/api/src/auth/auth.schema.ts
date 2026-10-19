// Better Auth's core tables (user, session, account, verification), owned by Better Auth and
// declared here so drizzle-kit generates their migration. Property names are the Better Auth field
// names the Drizzle adapter looks up; columns are snake_case. Change them only together with
// `auth.ts` and a new migration.
import { LOCALES } from '@ats/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

/** The tables handed to Better Auth's Drizzle adapter. */
export const authSchema = { user, session, account, verification };
