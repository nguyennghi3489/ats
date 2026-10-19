import { describe, expect, it } from 'vitest';
import { ConfigError } from '../config/config.js';
import { loadRedisUrl, loadWorkerConfig } from './worker-config.js';

const REDIS_URL = 'redis://127.0.0.1:6379';
const SMTP = {
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  EMAIL_FROM: 'ATS <no-reply@example.test>',
};

describe('loadWorkerConfig', () => {
  it('reads the Redis URL and SMTP settings and applies defaults for optional values', () => {
    expect(loadWorkerConfig({ REDIS_URL, ...SMTP })).toEqual({
      nodeEnv: 'development',
      logLevel: 'log',
      redisUrl: REDIS_URL,
      smtp: { host: '127.0.0.1', port: 1025, secure: false, from: 'ATS <no-reply@example.test>' },
    });
  });

  it('does not need the HTTP port', () => {
    expect(() =>
      loadWorkerConfig({
        REDIS_URL: 'rediss://cache.internal:6380',
        NODE_ENV: 'production',
        ...SMTP,
      }),
    ).not.toThrow();
  });

  it('names a missing or empty REDIS_URL', () => {
    expect(() => loadWorkerConfig({ ...SMTP })).toThrow(ConfigError);
    expect(() => loadWorkerConfig({ ...SMTP })).toThrow(/REDIS_URL is required/);
    expect(() => loadWorkerConfig({ REDIS_URL: '', ...SMTP })).toThrow(/REDIS_URL is required/);
  });

  it('rejects a URL that is not redis:// or rediss://', () => {
    expect(() => loadWorkerConfig({ REDIS_URL: 'http://127.0.0.1:6379', ...SMTP })).toThrow(
      /REDIS_URL/,
    );
    expect(() => loadWorkerConfig({ REDIS_URL: 'not a url', ...SMTP })).toThrow(/REDIS_URL/);
  });

  it('fails at startup when the SMTP settings are missing, naming each one', () => {
    let error: unknown;
    try {
      loadWorkerConfig({ REDIS_URL });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toMatch(/SMTP_HOST is required/);
    expect(message).toMatch(/SMTP_PORT is required/);
    expect(message).toMatch(/EMAIL_FROM is required/);
  });

  it('rejects a lone SMTP_USER', () => {
    expect(() => loadWorkerConfig({ REDIS_URL, ...SMTP, SMTP_USER: 'apikey' })).toThrow(
      /SMTP_PASSWORD is required when SMTP_USER is set/,
    );
  });

  it('lists every problem at once', () => {
    expect(() => loadWorkerConfig({ LOG_LEVEL: 'loud', ...SMTP })).toThrow(
      /REDIS_URL is required[\s\S]*LOG_LEVEL|LOG_LEVEL[\s\S]*REDIS_URL is required/,
    );
  });
});

describe('loadRedisUrl', () => {
  it('needs only REDIS_URL, for scripts that enqueue jobs', () => {
    expect(loadRedisUrl({ REDIS_URL })).toBe(REDIS_URL);
    expect(() => loadRedisUrl({})).toThrow(/REDIS_URL is required/);
  });
});
