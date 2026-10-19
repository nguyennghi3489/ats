import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const DATABASE_URL = 'postgres://ats:ats@127.0.0.1:5432/ats';

describe('loadConfig', () => {
  it('reads the required values and applies defaults for optional ones', () => {
    expect(loadConfig({ API_PORT: '3000', DATABASE_URL })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'log',
      databaseUrl: DATABASE_URL,
    });
  });

  it('reads every value when all are set', () => {
    expect(
      loadConfig({ API_PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn', DATABASE_URL }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: DATABASE_URL,
    });
  });

  it('accepts a postgresql:// connection string', () => {
    const url = 'postgresql://ats:ats@db:5432/ats';
    expect(loadConfig({ API_PORT: '3000', DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it('names a missing or invalid DATABASE_URL', () => {
    expect(() => loadConfig({ API_PORT: '3000' })).toThrow(/DATABASE_URL is required/);
    expect(() => loadConfig({ API_PORT: '3000', DATABASE_URL: 'redis://127.0.0.1:6379' })).toThrow(
      /DATABASE_URL must be a postgres:\/\/ or postgresql:\/\/ URL/,
    );
  });

  it('names a missing required variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/API_PORT is required/);
  });

  it('treats an empty value as missing', () => {
    expect(() => loadConfig({ API_PORT: '', DATABASE_URL })).toThrow(/API_PORT is required/);
  });

  it('names a variable with an invalid value', () => {
    expect(() => loadConfig({ API_PORT: 'abc', DATABASE_URL })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '70000', DATABASE_URL })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '3000', LOG_LEVEL: 'loud', DATABASE_URL })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('lists every problem at once', () => {
    let error: unknown;
    try {
      loadConfig({ NODE_ENV: 'staging' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toMatch(/API_PORT is required/);
    expect(message).toMatch(/NODE_ENV/);
    expect(message).toMatch(/DATABASE_URL is required/);
  });
});
