import { z } from 'zod';
import { type AppConfig, ConfigError, databaseUrlSchema } from '../config/config.js';

/** Environment the migration scripts read: no `API_PORT`, they open no HTTP port. */
const databaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: databaseUrlSchema(),
});

export type DatabaseConfig = Pick<AppConfig, 'nodeEnv' | 'databaseUrl'>;

/** Validates the environment for `db:migrate` and `db:reset`, or throws `ConfigError`. */
export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  // An empty value (`DATABASE_URL=`) counts as missing, as in `loadConfig`.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = databaseEnvSchema.safeParse(present);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join('.');
      return present[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
    });
    throw new ConfigError(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }
  return { nodeEnv: result.data.NODE_ENV, databaseUrl: result.data.DATABASE_URL };
}
