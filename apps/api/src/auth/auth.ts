import {
  DEFAULT_LOCALE,
  LOCALES,
  localeSchema,
  VERIFY_EMAIL_EXPIRED_PATH,
  VERIFY_EMAIL_SUCCESS_PATH,
} from '@ats/shared';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { verifyJWT } from 'better-auth/crypto';
import type { AppConfig } from '../config/config.js';
import type { DatabaseClient } from '../database/database.js';
import type { EmailService } from '../email/email.service.js';
import { authSchema } from './auth.schema.js';
import {
  CLIENT_IP_HEADER,
  EMAIL_SIGN_IN_PATH,
  type SignInLimiter,
  signInLimitHooks,
} from './sign-in-limit.js';
import {
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
 * The Better Auth instance: email + password sign-in, sessions stored in Postgres and checked
 * against Postgres on every request (cookie cache off), so deleting a session row signs it out
 * immediately. Failed email sign-ins are limited per client IP + email by `signInLimiter`
 * (decisions §2). Organizations (step 4) and Google/LinkedIn (step 16) are added here later.
 */
export function createAuth(
  config: AuthConfig,
  db: DatabaseClient,
  { emails, resend, signInLimiter }: AuthDependencies,
) {
  const secure = config.nodeEnv !== 'development';
  const verifiedUrl = `${config.webOrigin}${VERIFY_EMAIL_SUCCESS_PATH}`;
  const expiredUrl = `${config.webOrigin}${VERIFY_EMAIL_EXPIRED_PATH}`;
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
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: VERIFICATION_LINK_EXPIRES_IN_SECONDS,
      /**
       * Sign-up and resend: makes this link the only valid one for the email, counts the sign-up
       * send towards the limits (resends are counted in the `before` hook) and enqueues the email
       * in the user's language. The worker delivers it; nothing is sent over SMTP here.
       */
      sendVerificationEmail: async ({ user, url, token }, request) => {
        await resend.setCurrentLink(user.email, token);
        if (!isResendRequest(request)) await resend.record(user.email);
        // Whatever the client asked for, the link lands on the web app's verified page.
        const link = new URL(url);
        link.searchParams.set('callbackURL', verifiedUrl);
        const locale = localeSchema.safeParse((user as { locale?: unknown }).locale);
        await emails.enqueue({
          to: user.email,
          locale: locale.success ? locale.data : DEFAULT_LOCALE,
          template: 'verify-email',
          data: {
            name: user.name.trim() || user.email.split('@')[0] || user.email,
            url: link.href,
          },
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
          const decision = await resend.take(email);
          if (!decision.allowed) {
            const { code, retryAfterSeconds } = decision;
            throw new APIError(
              'TOO_MANY_REQUESTS',
              { code, message: code, retryAfterSeconds },
              { 'Retry-After': String(retryAfterSeconds) },
            );
          }
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
