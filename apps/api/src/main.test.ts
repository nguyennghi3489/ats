import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Startup check for `main.ts`: with a required variable missing, the process must exit
// non-zero before Nest starts and name the variable on stderr (issue #27).
describe('main startup', () => {
  let savedPort: string | undefined;

  beforeEach(() => {
    savedPort = process.env.API_PORT;
    delete process.env.API_PORT;
    vi.resetModules();
  });

  afterEach(() => {
    if (savedPort === undefined) {
      delete process.env.API_PORT;
    } else {
      process.env.API_PORT = savedPort;
    }
    vi.restoreAllMocks();
  });

  it('exits with code 1 and names API_PORT when it is missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(import('./main.js')).rejects.toThrow('process.exit(1)');

    expect(exit).toHaveBeenCalledWith(1);
    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(written).toContain('API_PORT is required');
  }, 30_000);
});
