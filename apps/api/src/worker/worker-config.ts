import { z } from 'zod';
import {
  type AppLogLevel,
  checkSmtpCredentials,
  LOG_LEVELS,
  parseEnv,
  type SmtpConfig,
  smtpConfigFrom,
  smtpEnvShape,
} from '../config/config.js';

const redisUrlSchema = z.url({
  protocol: /^rediss?$/,
  error: 'must be a redis:// or rediss:// URL',
});

/**
 * Environment variables the worker reads. The worker opens no HTTP port, so `API_PORT` is not
 * needed; `REDIS_URL` and the SMTP settings (it delivers email) are. Names match `.env.example`
 * (root and `apps/api`).
 */
const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
    REDIS_URL: redisUrlSchema,
    ...smtpEnvShape,
  })
  .superRefine(checkSmtpCredentials);

export interface WorkerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: AppLogLevel;
  redisUrl: string;
  smtp: SmtpConfig;
}

/** Validates the worker environment once at startup, or throws `ConfigError` naming every problem. */
export function loadWorkerConfig(env: Record<string, string | undefined>): WorkerConfig {
  const parsed = parseEnv(workerEnvSchema, env);
  return {
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL,
    redisUrl: parsed.REDIS_URL,
    smtp: smtpConfigFrom(parsed),
  };
}

/** Only `REDIS_URL`, for scripts that enqueue jobs without running a worker (`queue:ping`). */
export function loadRedisUrl(env: Record<string, string | undefined>): string {
  return parseEnv(z.object({ REDIS_URL: redisUrlSchema }), env).REDIS_URL;
}
