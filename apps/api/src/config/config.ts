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

/**
 * Environment variables the API reads. Names match `.env.example` (root and `apps/api`).
 * Feature modules add their variables here so a misconfigured deploy fails at startup.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z
    .string()
    .regex(/^\d+$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(1, 'must be 1-65535').max(65535, 'must be 1-65535')),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  DATABASE_URL: databaseUrlSchema(),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: AppLogLevel;
  databaseUrl: string;
}

/** Thrown when the environment does not match the schema. The message names every bad variable. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Validates the environment once at startup and returns typed config, or throws `ConfigError`. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  // An empty value (`API_PORT=`) counts as missing, so required checks and defaults apply.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      return present[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }
  const { NODE_ENV, API_PORT, LOG_LEVEL, DATABASE_URL } = result.data;
  return { nodeEnv: NODE_ENV, port: API_PORT, logLevel: LOG_LEVEL, databaseUrl: DATABASE_URL };
}
