import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the port and applies defaults for optional values', () => {
    expect(loadConfig({ API_PORT: '3000' })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'log',
    });
  });

  it('reads every value when all are set', () => {
    expect(loadConfig({ API_PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn' })).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
    });
  });

  it('names a missing required variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/API_PORT is required/);
  });

  it('treats an empty value as missing', () => {
    expect(() => loadConfig({ API_PORT: '' })).toThrow(/API_PORT is required/);
  });

  it('names a variable with an invalid value', () => {
    expect(() => loadConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: '3000', LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
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
  });
});
