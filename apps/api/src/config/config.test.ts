import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadSmtpConfig } from './config.js';

const DATABASE_URL = 'postgres://ats:ats@127.0.0.1:5432/ats';
const BETTER_AUTH_SECRET = 'test-only-secret-0123456789abcdef0123456789';
const BETTER_AUTH_URL = 'http://localhost:3000';
const WEB_ORIGIN = 'http://localhost:5173';
const REDIS_URL = 'redis://127.0.0.1:6379';
/** Every required variable except `API_PORT`. */
const REQUIRED = { DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, WEB_ORIGIN };
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
      redisUrl: REDIS_URL,
      trustProxy: false,
      ...AUTH_CONFIG,
    });
  });

  it('reads every value when all are set', () => {
    expect(
      loadConfig({
        API_PORT: '8080',
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn',
        TRUST_PROXY: 'true',
        ...REQUIRED,
      }),
    ).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: DATABASE_URL,
      redisUrl: REDIS_URL,
      trustProxy: true,
      ...AUTH_CONFIG,
    });
  });

  it('names a missing or invalid REDIS_URL', () => {
    expect(() => loadConfig({ API_PORT: '3000', ...without('REDIS_URL') })).toThrow(
      /REDIS_URL is required/,
    );
    expect(() =>
      loadConfig({ API_PORT: '3000', ...REQUIRED, REDIS_URL: 'http://127.0.0.1:6379' }),
    ).toThrow(/REDIS_URL must be a redis:\/\/ or rediss:\/\/ URL/);
  });

  it('accepts only true or false for TRUST_PROXY', () => {
    expect(loadConfig({ API_PORT: '3000', ...REQUIRED, TRUST_PROXY: 'false' }).trustProxy).toBe(
      false,
    );
    expect(() => loadConfig({ API_PORT: '3000', ...REQUIRED, TRUST_PROXY: 'yes' })).toThrow(
      /TRUST_PROXY must be true or false/,
    );
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
    expect(message).toMatch(/REDIS_URL is required/);
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

describe('loadSmtpConfig', () => {
  const MAILPIT = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    EMAIL_FROM: 'ATS <no-reply@example.test>',
  };

  it('reads the Mailpit defaults: no TLS, no credentials', () => {
    expect(loadSmtpConfig(MAILPIT)).toEqual({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      from: 'ATS <no-reply@example.test>',
    });
  });

  it('reads TLS and credentials for a hosted provider', () => {
    expect(
      loadSmtpConfig({
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'apikey',
        SMTP_PASSWORD: 'not-a-real-secret',
        EMAIL_FROM: 'no-reply@example.test',
      }),
    ).toEqual({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: { user: 'apikey', pass: 'not-a-real-secret' },
      from: 'no-reply@example.test',
    });
  });

  it('names every missing SMTP variable at once', () => {
    let error: unknown;
    try {
      loadSmtpConfig({});
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toMatch(/SMTP_HOST is required/);
    expect(message).toMatch(/SMTP_PORT is required/);
    expect(message).toMatch(/EMAIL_FROM is required/);
  });

  it('names invalid SMTP values', () => {
    expect(() => loadSmtpConfig({ ...MAILPIT, SMTP_PORT: 'smtp' })).toThrow(/SMTP_PORT/);
    expect(() => loadSmtpConfig({ ...MAILPIT, SMTP_SECURE: 'yes' })).toThrow(
      /SMTP_SECURE must be true or false/,
    );
    expect(() => loadSmtpConfig({ ...MAILPIT, EMAIL_FROM: 'ATS' })).toThrow(
      /EMAIL_FROM must be an email address/,
    );
  });

  it('needs SMTP_USER and SMTP_PASSWORD together', () => {
    expect(() => loadSmtpConfig({ ...MAILPIT, SMTP_USER: 'apikey' })).toThrow(
      /SMTP_PASSWORD is required when SMTP_USER is set/,
    );
    expect(() => loadSmtpConfig({ ...MAILPIT, SMTP_PASSWORD: 'x' })).toThrow(
      /SMTP_USER is required when SMTP_PASSWORD is set/,
    );
  });
});
