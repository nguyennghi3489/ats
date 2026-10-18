import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { runWithRequestId } from '../http/request-context.js';
import { JsonLogger, logLevelsFrom } from './json-logger.js';

describe('logLevelsFrom', () => {
  it('enables the chosen level and every more severe one', () => {
    expect(logLevelsFrom('log')).toEqual(['log', 'warn', 'error', 'fatal']);
    expect(logLevelsFrom('verbose')).toEqual(['verbose', 'debug', 'log', 'warn', 'error', 'fatal']);
    expect(logLevelsFrom('fatal')).toEqual(['fatal']);
  });
});

describe('JsonLogger', () => {
  let stdout: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
  });

  function lastRecord(): Record<string, unknown> {
    const line = String(stdout.mock.calls.at(-1)?.[0]);
    return JSON.parse(line) as Record<string, unknown>;
  }

  it('writes one JSON object per line', () => {
    new JsonLogger({ logLevels: ['log'] }).log('hello', 'Test');

    const line = String(stdout.mock.calls.at(-1)?.[0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trim().split('\n')).toHaveLength(1);
    expect(lastRecord()).toMatchObject({ level: 'log', message: 'hello', context: 'Test' });
  });

  it('adds the current request id', () => {
    const logger = new JsonLogger({ logLevels: ['log'] });

    runWithRequestId('req-123', () => logger.log('inside a request'));

    expect(lastRecord()).toMatchObject({ message: 'inside a request', requestId: 'req-123' });
  });

  it('omits the request id outside a request', () => {
    new JsonLogger({ logLevels: ['log'] }).log('at startup');

    expect(lastRecord()).not.toHaveProperty('requestId');
  });

  it('puts structured params at the top level', () => {
    new JsonLogger({ logLevels: ['log'] }).log('request completed', { statusCode: 200 });

    expect(lastRecord()).toMatchObject({ message: 'request completed', statusCode: 200 });
  });

  it('skips disabled levels', () => {
    new JsonLogger({ logLevels: ['warn'] }).log('quiet');

    expect(stdout).not.toHaveBeenCalled();
  });
});
