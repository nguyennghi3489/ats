import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadSmtpConfig } from './config.js';

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
