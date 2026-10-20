import { randomUUID } from 'node:crypto';
import {
  DEFAULT_LOCALE,
  LOCALES,
  localeSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_INVALID_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_EXPIRED_PATH,
  VERIFY_EMAIL_SUCCESS_PATH,
  type WorkspaceRole,
} from '@ats/shared';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { signJWT, verifyJWT } from 'better-auth/crypto';
import { organization } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/organization/access';
import type { AppConfig } from '../config/config.js';
import type { DatabaseClient } from '../database/database.js';
import type { EmailService } from '../email/email.service.js';
import { authSchema, MEMBER_STATUSES } from './auth.schema.js';
import {
  invalidateEarlierResetLinks,
  isUsableResetLink,
  REQUEST_PASSWORD_RESET_PATH,
  RESET_PASSWORD_CALLBACK_PATH,
  RESET_PASSWORD_LINK_EXPIRES_IN_SECONDS,
  resetPasswordIdentifier,
  webResetPageUrl,
} from './password-reset.js';
import {
  CLIENT_IP_HEADER,
  EMAIL_SIGN_IN_PATH,
  type SignInLimiter,
  signInLimitHooks,
} from './sign-in-limit.js';
import {
  type ResendDecision,
  VERIFICATION_LINK_EXPIRES_IN_SECONDS,
  type VerificationResend,
} from './verification-resend.js';

const DAY_SECONDS = 24 * 60 * 60;

/** Session rules (decisions §2): 30 days, extended on use at most once a day, no inactivity logout. */
export const SESSION_EXPIRES_IN_SECONDS = 30 * DAY_SECONDS;
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;

/** Where the Better Auth endpoints are served (`/api/auth/sign-in/email`, ...). */
export const AUTH_BASE_PATH = '/api/auth';

export type AuthConfig = Pick<
  AppConfig,
  'nodeEnv' | 'betterAuthSecret' | 'betterAuthUrl' | 'webOrigin'
>;

/** What `createAuth` sends email, keeps resend limits and limits failed sign-ins with. */
export interface AuthDependencies {
  emails: Pick<EmailService, 'enqueue'>;
  resend: VerificationResend;
  /** Limits on password reset requests (`createPasswordResetLimits`). */
  resetLimits: Pick<VerificationResend, 'take'>;
  signInLimiter: SignInLimiter;
}

const logger = new Logger('BetterAuth');

/** Better Auth's resend endpoint, which the resend limits apply to. */
const SEND_VERIFICATION_EMAIL_PATH = '/send-verification-email';

/** Whether Better Auth is sending because of a resend request (not sign-up). */
function isResendRequest(request: Request | undefined): boolean {
  return (
    request !== undefined && new URL(request.url).pathname.endsWith(SEND_VERIFICATION_EMAIL_PATH)
  );
}

/**
 * Whether `token` is a valid, unexpired verification token (signed with `secret`) and the newest
 * one issued for its email. Change-email tokens are refused: that flow is not enabled.
 */
async function isCurrentVerificationToken(
  token: string,
  secret: string,
  resend: VerificationResend,
): Promise<boolean> {
  const payload = await verifyJWT<{ email?: unknown; updateTo?: unknown }>(token, secret);
  if (payload === null || typeof payload.email !== 'string' || payload.updateTo !== undefined) {
    return false;
  }
  return resend.isCurrentLink(payload.email, token);
}

/**
 * A verification token like Better Auth's own (an HS256 JWT of the lower-cased email, valid for
 * `VERIFICATION_LINK_EXPIRES_IN_SECONDS`) plus a random `jti`. Better Auth's token carries only the
 * email and whole-second times, so two links sent within the same second would be identical and
 * the "replaced" one would keep working; the `jti` makes every link distinct.
 */
function newVerificationToken(email: string, secret: string): Promise<string> {
  return signJWT(
    { email: email.toLowerCase(), jti: randomUUID() },
    secret,
    VERIFICATION_LINK_EXPIRES_IN_SECONDS,
  );
}

/** The recipient as emails greet them: their name, else the local part of the address. */
function displayName(user: { name: string; email: string }): string {
  return user.name.trim() || user.email.split('@')[0] || user.email;
}

/** The user's saved language, for emails (decisions §12). */
function userLocale(user: object) {
  const locale = localeSchema.safeParse((user as { locale?: unknown }).locale);
  return locale.success ? locale.data : DEFAULT_LOCALE;
}

/** Workspace invitations are valid for 7 days (decisions §2). */
const INVITATION_EXPIRES_IN_SECONDS = 7 * DAY_SECONDS;

/**
 * Organization plugin permissions for the workspace roles (decisions §3): only admins manage the
 * workspace, its members and invitations; recruiters and collaborators manage none of it. Nobody
 * deletes a workspace (deletion is disabled too). Job and candidate rules live in our own code.
 */
const workspaceAccess = createAccessControl(defaultStatements);
const workspaceRoles = {
  admin: workspaceAccess.newRole(adminAc.statements),
  recruiter: workspaceAccess.newRole({ organization: [], member: [], invitation: [] }),
  collaborator: workspaceAccess.newRole({ organization: [], member: [], invitation: [] }),
} satisfies Record<WorkspaceRole, unknown>;

/** The Better Auth organization plugin, configured as our workspaces (decisions §2–§5). */
function workspacesPlugin() {
  return organization({
    ac: workspaceAccess,
    roles: workspaceRoles,
    creatorRole: 'admin' satisfies WorkspaceRole,
    // Workspaces are created by `POST /api/workspaces` only: one transaction with the admin
    // membership, the generated slug, the fixed code prefix and the idempotency key.
    allowUserToCreateOrganization: false,
    // Workspaces and their members are never hard-deleted (decisions §4).
    disableOrganizationDeletion: true,
    invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
    schema: {
      organization: {
        additionalFields: {
          // Set once at creation (decisions §5); `input: false` keeps it out of create/update bodies.
          codePrefix: { type: 'string', required: true, input: false },
        },
      },
      member: {
        additionalFields: {
          status: {
            type: [...MEMBER_STATUSES],
            required: true,
            defaultValue: 'active',
            input: false,
          },
        },
      },
    },
    organizationHooks: {
      beforeUpdateOrganization: async ({ organization: data }) => {
        // Second line of defence: the prefix never changes, whatever reaches the update.
        if ('codePrefix' in data) {
          throw new APIError('BAD_REQUEST', {
            code: 'CODE_PREFIX_NOT_EDITABLE',
            message: 'CODE_PREFIX_NOT_EDITABLE',
          });
        }
        // Unknown and read-only fields are stripped from the body; with nothing left Better Auth
        // would run an empty UPDATE and answer 500.
        if (Object.keys(data).length === 0) {
          throw new APIError('BAD_REQUEST', {
            code: 'VALIDATION_FAILED',
            message: 'VALIDATION_FAILED',
          });
        }
      },
    },
  });
}

/** 429 for a refused resend or reset request, with the seconds to wait (body and header). */
function refuseIfLimited(decision: ResendDecision): void {
  if (decision.allowed) return;
  const { code, retryAfterSeconds } = decision;
  throw new APIError(
    'TOO_MANY_REQUESTS',
    { code, message: code, retryAfterSeconds },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

/**
 * The Better Auth instance: email + password sign-in, sessions stored in Postgres and checked
 * against Postgres on every request (cookie cache off), so deleting a session row signs it out
 * immediately. Failed email sign-ins are limited per client IP + email by `signInLimiter`
 * (decisions §2). Password reset: 1 h single-use links, the newest one only, requests limited
 * like the verification resend, all sessions signed out on reset. Workspaces are Better Auth
 * organizations (`workspacesPlugin`). Google/LinkedIn (step 16) are added here later.
 */
export function createAuth(
  config: AuthConfig,
  db: DatabaseClient,
  { emails, resend, resetLimits, signInLimiter }: AuthDependencies,
) {
  const secure = config.nodeEnv !== 'development';
  const verifiedUrl = `${config.webOrigin}${VERIFY_EMAIL_SUCCESS_PATH}`;
  const expiredUrl = `${config.webOrigin}${VERIFY_EMAIL_EXPIRED_PATH}`;
  const resetPageUrl = `${config.webOrigin}${RESET_PASSWORD_PATH}`;
  const resetInvalidUrl = `${config.webOrigin}${RESET_PASSWORD_INVALID_PATH}`;
  const signInLimit = signInLimitHooks(signInLimiter, logger);
  return betterAuth({
    appName: 'ATS',
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Same bounds as the shared `passwordSchema` the web forms use (sign-up and reset).
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_LINK_EXPIRES_IN_SECONDS,
      // Password reset signs out all sessions of the user (decisions §2).
      revokeSessionsOnPasswordReset: true,
      /**
       * Only for known users (Better Auth answers unknown emails the same way and sends nothing).
       * Makes this link the only valid one for the user and enqueues the email in their language.
       */
      sendResetPassword: async ({ user, url, token }) => {
        await invalidateEarlierResetLinks(db, user.id, token);
        // Whatever the client asked for, the link lands on the web app's reset page.
        const link = new URL(url);
        link.searchParams.set('callbackURL', resetPageUrl);
        await emails.enqueue({
          to: user.email,
          locale: userLocale(user),
          template: 'reset-password',
          data: { name: displayName(user), url: link.href },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: VERIFICATION_LINK_EXPIRES_IN_SECONDS,
      /**
       * Sign-up and resend: makes this link the only valid one for the email, counts the sign-up
       * send towards the limits (resends are counted in the `before` hook) and enqueues the email
       * in the user's language. The worker delivers it; nothing is sent over SMTP here.
       */
      sendVerificationEmail: async ({ user, url }, request) => {
        const token = await newVerificationToken(user.email, config.betterAuthSecret);
        await resend.setCurrentLink(user.email, token);
        if (!isResendRequest(request)) await resend.record(user.email);
        // Our own unique token replaces Better Auth's; whatever the client asked for, the link
        // lands on the web app's verified page.
        const link = new URL(url);
        link.searchParams.set('token', token);
        link.searchParams.set('callbackURL', verifiedUrl);
        await emails.enqueue({
          to: user.email,
          locale: userLocale(user),
          template: 'verify-email',
          data: { name: displayName(user), url: link.href },
        });
      },
    },
    user: {
      additionalFields: {
        locale: {
          type: [...LOCALES],
          required: false,
          defaultValue: DEFAULT_LOCALE,
          input: true,
          validator: { input: localeSchema },
        },
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: false },
    },
    // Better Auth's own limiter (per IP, in memory, on in production only) stays on its defaults
    // except for email sign-in: that endpoint is limited by `signInLimiter` per IP + email in Redis,
    // and Better Auth's stricter rule for it (3 per 10 s per IP) would answer 429 first.
    rateLimit: { customRules: { [EMAIL_SIGN_IN_PATH]: false } },
    account: {
      // The same email never links a second sign-in method automatically (decisions §2).
      accountLinking: { disableImplicitLinking: true },
    },
    advanced: {
      // Better Auth skips the origin check when NODE_ENV=test; keep it on so tests see production rules.
      disableOriginCheck: false,
      // The client IP Nest resolved (honouring `trust proxy`); the auth middleware always sets it,
      // so a client cannot pick its IP with X-Forwarded-For when no proxy is trusted.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === SEND_VERIFICATION_EMAIL_PATH) {
          // Counted for every address, known or not, so a 429 reveals nothing about accounts.
          const email: unknown = ctx.body?.email;
          if (typeof email !== 'string') return;
          refuseIfLimited(await resend.take(email));
        } else if (ctx.path === REQUEST_PASSWORD_RESET_PATH) {
          // Same as the resend: counted for every address, so a 429 reveals nothing either.
          const email: unknown = ctx.body?.email;
          if (typeof email !== 'string') return;
          refuseIfLimited(await resetLimits.take(email));
        } else if (ctx.path === RESET_PASSWORD_CALLBACK_PATH) {
          // The emailed link: valid → the web reset page with the token; expired, used, replaced
          // by a newer link or unknown → the invalid page. The client's callbackURL is ignored.
          const token: unknown = ctx.params?.token;
          const stored =
            typeof token === 'string' && token !== ''
              ? await ctx.context.internalAdapter.findVerificationValue(
                  resetPasswordIdentifier(token),
                )
              : null;
          if (typeof token !== 'string' || !isUsableResetLink(stored)) {
            throw ctx.redirect(resetInvalidUrl);
          }
          throw ctx.redirect(webResetPageUrl(config.webOrigin, token));
        } else if (ctx.path === '/verify-email') {
          // Expired, tampered or replaced by a newer link: the web app offers a new one.
          const token: unknown = ctx.query?.token;
          const current =
            typeof token === 'string' &&
            (await isCurrentVerificationToken(token, ctx.context.secret, resend));
          if (!current) throw ctx.redirect(expiredUrl);
        } else {
          await signInLimit.before(ctx);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        await signInLimit.after(ctx);
      }),
    },
    plugins: [workspacesPlugin()],
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      log: (level, message) => {
        if (level === 'error') {
          logger.error(message);
        } else if (level === 'warn') {
          logger.warn(message);
        } else {
          logger.debug(message);
        }
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
