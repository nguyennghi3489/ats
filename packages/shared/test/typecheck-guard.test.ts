import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards issue #25: a type error in packages/shared must make the strict typecheck fail.
const here = dirname(fileURLToPath(import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function typecheck(fixture: string) {
  return spawnSync(
    process.execPath,
    [tsc, '-p', join(here, 'fixtures', fixture, 'tsconfig.json')],
    {
      encoding: 'utf8',
    },
  );
}

describe('strict typecheck', () => {
  it('fails on a deliberate type error against a shared type', () => {
    const result = typecheck('type-error');
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('TS2322');
  });

  it('passes on valid code against the same shared type', () => {
    const result = typecheck('valid');
    expect(result.stdout).toBe('');
    expect(result.status).toBe(0);
  });
});
