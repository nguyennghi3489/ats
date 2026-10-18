import { describe, expect, it } from 'vitest';
import { ConfigError } from '../config/config.js';
import { loadWorkerConfig } from './worker-config.js';

describe('loadWorkerConfig', () => {
  it('reads the Redis URL and applies defaults for optional values', () => {
    expect(loadWorkerConfig({ REDIS_URL: 'redis://127.0.0.1:6379' })).toEqual({
      nodeEnv: 'development',
      logLevel: 'log',
      redisUrl: 'redis://127.0.0.1:6379',
    });
  });

  it('does not need the HTTP port', () => {
    expect(() =>
      loadWorkerConfig({ REDIS_URL: 'rediss://cache.internal:6380', NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('names a missing or empty REDIS_URL', () => {
    expect(() => loadWorkerConfig({})).toThrow(ConfigError);
    expect(() => loadWorkerConfig({})).toThrow(/REDIS_URL is required/);
    expect(() => loadWorkerConfig({ REDIS_URL: '' })).toThrow(/REDIS_URL is required/);
  });

  it('rejects a URL that is not redis:// or rediss://', () => {
    expect(() => loadWorkerConfig({ REDIS_URL: 'http://127.0.0.1:6379' })).toThrow(/REDIS_URL/);
    expect(() => loadWorkerConfig({ REDIS_URL: 'not a url' })).toThrow(/REDIS_URL/);
  });

  it('lists every problem at once', () => {
    expect(() => loadWorkerConfig({ LOG_LEVEL: 'loud' })).toThrow(
      /REDIS_URL is required[\s\S]*LOG_LEVEL|LOG_LEVEL[\s\S]*REDIS_URL is required/,
    );
  });
});
