import { DEFAULT_LOCALE, LOCALES, localeSchema } from '@ats/shared';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { AppConfig } from '../config/config.js';
import type { DatabaseClient } from '../database/database.js';
import { authSchema } from './auth.schema.js';
import {
  CLIENT_IP_HEADER,
  EMAIL_SIGN_IN_PATH,
  type SignInLimiter,
  signInLimitHooks,
} from './sign-in-limit.js';

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

const logger = new Logger('BetterAuth');

/**
 * The Better Auth instance: email + password sign-in, sessions stored in Postgres and checked
 * against Postgres on every request (cookie cache off), so deleting a session row signs it out
 * immediately. Failed email sign-ins are limited per client IP + email by `signInLimiter`
 * (decisions §2). Organizations (step 4) and Google/LinkedIn (step 16) are added here later.
 */
export function createAuth(config: AuthConfig, db: DatabaseClient, signInLimiter: SignInLimiter) {
  const secure = config.nodeEnv !== 'development';
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
    hooks: signInLimitHooks(signInLimiter, logger),
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
