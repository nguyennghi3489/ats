import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const DATABASE_URL = 'postgres://ats:ats@127.0.0.1:5432/ats';
const BETTER_AUTH_SECRET = 'test-only-secret-0123456789abcdef0123456789';
const BETTER_AUTH_URL = 'http://localhost:3000';
const WEB_ORIGIN = 'http://localhost:5173';
/** Every required variable except `API_PORT`. */
const REQUIRED = { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WEB_ORIGIN };
/** `REQUIRED` without one variable. */
function without(name: keyof typeof REQUIRED): Record<string, string> {
  return Object.fromEntries(Object.entries(REQUIRED).filter(([key]) => key !== name));
}
const AUTH_CONFIG = {
  betterAuthSecret: BETTER_AUTH_SECRET,
  betterAuthUrl: BETTER_AUTH_URL,
  webOrigin: WEB_ORIGIN,
};

describe('loadConfig', () => {
  it('reads the required values and applies defaults for optional ones', () => {
    expect(loadConfig({ API_PORT: '3000', ...REQUIRED })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'log',
      databaseUrl: DATABASE_URL,
      ...AUTH_CONFIG,
    });
  });

  it('reads every value when all are set', () => {
    expect(
      loadConfig({ API_PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn', ...REQUIRED }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: DATABASE_URL,
      ...AUTH_CONFIG,
    });
  });

  it('accepts a postgresql:// connection string', () => {
    const url = 'postgresql://ats:ats@db:5432/ats';
    expect(loadConfig({ API_PORT: '3000', ...REQUIRED, DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it('names a missing or invalid DATABASE_URL', () => {
    expect(() => loadConfig({ API_PORT: '3000', ...without('DATABASE_URL') })).toThrow(
      /DATABASE_URL is required/,
    );
    expect(() =>
      loadConfig({ API_PORT: '3000', ...REQUIRED, DATABASE_URL: 'redis://127.0.0.1:6379' }),
    ).toThrow(/DATABASE_URL must be a postgres:\/\/ or postgresql:\/\/ URL/);
  });

  it('names a missing required variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/API_PORT is required/);
  });

  it('treats an empty value as missing', () => {
    expect(() => loadConfig({ API_PORT: '', ...REQUIRED })).toThrow(/API_PORT is required/);
  });

  it('names a variable with an invalid value', () => {
    expect(() => loadConfig({ API_PORT: 'abc', ...REQUIRED })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '70000', ...REQUIRED })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '3000', LOG_LEVEL: 'loud', ...REQUIRED })).toThrow(
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
    expect(message).toMatch(/BETTER_AUTH_SECRET is required/);
    expect(message).toMatch(/BETTER_AUTH_URL is required/);
    expect(message).toMatch(/WEB_ORIGIN is required/);
  });

  describe('authentication settings', () => {
    it('fails when BETTER_AUTH_SECRET is missing or empty', () => {
      const withoutSecret = without('BETTER_AUTH_SECRET');
      expect(() => loadConfig({ API_PORT: '3000', ...withoutSecret })).toThrow(ConfigError);
      expect(() => loadConfig({ API_PORT: '3000', ...withoutSecret })).toThrow(
        /BETTER_AUTH_SECRET is required/,
      );
      expect(() => loadConfig({ API_PORT: '3000', ...REQUIRED, BETTER_AUTH_SECRET: '' })).toThrow(
        /BETTER_AUTH_SECRET is required/,
      );
    });

    it('refuses a BETTER_AUTH_SECRET shorter than 32 characters', () => {
      expect(() =>
        loadConfig({ API_PORT: '3000', ...REQUIRED, BETTER_AUTH_SECRET: 'too-short' }),
      ).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/);
    });

    it('needs http(s) URLs for BETTER_AUTH_URL and WEB_ORIGIN', () => {
      expect(() =>
        loadConfig({ API_PORT: '3000', ...REQUIRED, BETTER_AUTH_URL: 'localhost:3000' }),
      ).toThrow(/BETTER_AUTH_URL/);
      expect(() =>
        loadConfig({ API_PORT: '3000', ...REQUIRED, WEB_ORIGIN: 'ftp://localhost' }),
      ).toThrow(/WEB_ORIGIN/);
    });

    it('keeps only the origin of WEB_ORIGIN', () => {
      expect(
        loadConfig({ API_PORT: '3000', ...REQUIRED, WEB_ORIGIN: 'https://app.example.test/' })
          .webOrigin,
      ).toBe('https://app.example.test');
    });
  });
});
