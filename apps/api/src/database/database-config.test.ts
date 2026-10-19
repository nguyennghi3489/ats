import { describe, expect, it } from 'vitest';
import { ConfigError } from '../config/config.js';
import { loadDatabaseConfig } from './database-config.js';

describe('loadDatabaseConfig', () => {
  it('needs only DATABASE_URL, not API_PORT', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgres://ats:ats@127.0.0.1:5432/ats' })).toEqual({
      nodeEnv: 'development',
      databaseUrl: 'postgres://ats:ats@127.0.0.1:5432/ats',
    });
  });

  it('reads NODE_ENV', () => {
    expect(
      loadDatabaseConfig({ DATABASE_URL: 'postgres://db/ats', NODE_ENV: 'production' }).nodeEnv,
    ).toBe('production');
  });

  it('names a missing or invalid DATABASE_URL', () => {
    expect(() => loadDatabaseConfig({})).toThrow(ConfigError);
    expect(() => loadDatabaseConfig({ DATABASE_URL: '' })).toThrow(/DATABASE_URL is required/);
    expect(() => loadDatabaseConfig({ DATABASE_URL: 'http://db' })).toThrow(/DATABASE_URL must/);
  });
});
