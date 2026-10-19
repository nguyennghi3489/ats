import { z } from 'zod';

/** Nest log levels, most verbose first. `LOG_LEVEL` enables the named level and every level after it. */
export const LOG_LEVELS = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'] as const;
export type AppLogLevel = (typeof LOG_LEVELS)[number];

/** A Postgres connection string (`DATABASE_URL`). Shared with the migration scripts. */
export function databaseUrlSchema() {
  return z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// or postgresql:// URL',
  });
}

/** A Redis connection string (`REDIS_URL`): BullMQ queues and short-lived counters. */
export function redisUrlSchema() {
  return z.url({ protocol: /^rediss?$/, error: 'must be a redis:// or rediss:// URL' });
}

/** An absolute http(s) URL. */
function httpUrlSchema() {
  return z.url({ protocol: /^https?$/, error: 'must be an http:// or https:// URL' });
}

/** A TCP port given as text (`API_PORT`, `SMTP_PORT`). */
function portSchema() {
  return z
    .string()
    .regex(/^\d+$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(1, 'must be 1-65535').max(65535, 'must be 1-65535'));
}

/**
 * Environment variables the API reads. Names match `.env.example` (root and `apps/api`).
 * Feature modules add their variables here so a misconfigured deploy fails at startup.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: portSchema(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  DATABASE_URL: databaseUrlSchema(),
  // Queues (the API enqueues email) and the verification-email resend limits.
  REDIS_URL: redisUrlSchema(),
  // Signs session cookies and tokens. Better Auth asks for at least 32 characters.
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Public URL the API is reached at (Better Auth builds links and cookie settings from it).
  BETTER_AUTH_URL: httpUrlSchema(),
  // Origin of the recruiter web app; the only origin allowed to call the auth endpoints.
  WEB_ORIGIN: httpUrlSchema().transform((url) => new URL(url).origin),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: AppLogLevel;
  databaseUrl: string;
  redisUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  webOrigin: string;
}

/** Thrown when the environment does not match the schema. The message names every bad variable. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Parses the environment with `schema`, or throws `ConfigError` listing every problem as
 * `NAME is required` or `NAME <message>`. An empty value (`API_PORT=`) counts as missing, so
 * required checks and defaults apply.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined>,
): z.output<T> {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = schema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      // Cross-field rules (`checkSmtpCredentials`) phrase the whole problem themselves.
      if (issue.code === 'custom' && issue.params?.crossField === true) {
        return `${name} ${issue.message}`;
      }
      return present[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }
  return result.data;
}

/** Validates the environment once at startup and returns typed config, or throws `ConfigError`. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const data = parseEnv(envSchema, env);
  return {
    nodeEnv: data.NODE_ENV,
    port: data.API_PORT,
    logLevel: data.LOG_LEVEL,
    databaseUrl: data.DATABASE_URL,
    redisUrl: data.REDIS_URL,
    betterAuthSecret: data.BETTER_AUTH_SECRET,
    betterAuthUrl: data.BETTER_AUTH_URL,
    webOrigin: data.WEB_ORIGIN,
  };
}

/** `no-reply@example.test` or `ATS <no-reply@example.test>`. */
function isSenderAddress(value: string): boolean {
  const match = /^(?:[^<>]*<([^<>\s]+)>|([^<>\s]+))$/.exec(value.trim());
  const address = match?.[1] ?? match?.[2];
  return address !== undefined && z.email().safeParse(address).success;
}

/**
 * SMTP settings for sending email (decisions §1): Mailpit in local Compose (no TLS, no
 * credentials), Resend over SMTP in production. Read by the worker, which delivers the mail.
 */
export const smtpEnvShape = {
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: portSchema(),
  SMTP_SECURE: z
    .enum(['true', 'false'], { error: 'must be true or false' })
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z
    .string()
    .refine(isSenderAddress, 'must be an email address, optionally with a name: ATS <no-reply@…>'),
};

type SmtpEnv = z.output<z.ZodObject<typeof smtpEnvShape>>;

/** For `.superRefine` on a schema that includes `smtpEnvShape`: credentials come in pairs. */
export function checkSmtpCredentials(env: SmtpEnv, context: z.RefinementCtx): void {
  const pair = [
    ['SMTP_USER', 'SMTP_PASSWORD'],
    ['SMTP_PASSWORD', 'SMTP_USER'],
  ] as const;
  for (const [set, missing] of pair) {
    if (env[set] !== undefined && env[missing] === undefined) {
      context.addIssue({
        code: 'custom',
        path: [missing],
        message: `is required when ${set} is set`,
        params: { crossField: true },
      });
    }
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). `false` still upgrades with STARTTLS when offered. */
  secure: boolean;
  auth?: { user: string; pass: string };
  /** Sender of every email, e.g. `ATS <no-reply@example.test>`. */
  from: string;
}

/** Turns the parsed `smtpEnvShape` values into `SmtpConfig`. */
export function smtpConfigFrom(env: SmtpEnv): SmtpConfig {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER !== undefined && env.SMTP_PASSWORD !== undefined
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
    from: env.EMAIL_FROM.trim(),
  };
}

/** Validates the SMTP variables alone, or throws `ConfigError` naming every problem. */
export function loadSmtpConfig(env: Record<string, string | undefined>): SmtpConfig {
  return smtpConfigFrom(parseEnv(z.object(smtpEnvShape).superRefine(checkSmtpCredentials), env));
}
