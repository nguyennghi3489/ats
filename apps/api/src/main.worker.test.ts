import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Startup check for `main.worker.ts`: without REDIS_URL the worker exits non-zero before Nest
// starts and names the variable on stderr.
describe('worker startup', () => {
  let savedRedisUrl: string | undefined;

  beforeEach(() => {
    savedRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = savedRedisUrl;
    }
    vi.restoreAllMocks();
  });

  it('exits with code 1 and names REDIS_URL when it is missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(import('./main.worker.js')).rejects.toThrow('process.exit(1)');

    expect(exit).toHaveBeenCalledWith(1);
    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(written).toContain('REDIS_URL is required');
  }, 30_000);
});
