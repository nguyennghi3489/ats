import { z } from 'zod';
import { type AppLogLevel, ConfigError, LOG_LEVELS } from '../config/config.js';

/**
 * Environment variables the worker reads. The worker opens no HTTP port, so `API_PORT` is not
 * needed; `REDIS_URL` is. Names match `.env.example` (root and `apps/api`).
 */
const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
  REDIS_URL: z.url({
    protocol: /^rediss?$/,
    error: 'must be a redis:// or rediss:// URL',
  }),
});

export interface WorkerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: AppLogLevel;
  redisUrl: string;
}

/** Validates the worker environment once at startup, or throws `ConfigError` naming every problem. */
export function loadWorkerConfig(env: Record<string, string | undefined>): WorkerConfig {
  // An empty value (`REDIS_URL=`) counts as missing, as in `loadConfig`.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = workerEnvSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      return present[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }
  const { NODE_ENV, LOG_LEVEL, REDIS_URL } = result.data;
  return { nodeEnv: NODE_ENV, logLevel: LOG_LEVEL, redisUrl: REDIS_URL };
}
