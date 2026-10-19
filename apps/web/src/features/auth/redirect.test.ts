import { describe, expect, it } from 'vitest';
import { safeRedirect, signInPath } from './redirect';

describe('safeRedirect', () => {
  it.each(['/', '/jobs', '/jobs?status=open', '/jobs/AN-001#notes', '/ung-vien?q=Nguy%E1%BB%85n'])(
    'keeps the same-origin path %s',
    (value) => {
      expect(safeRedirect(value)).toBe(value);
    },
  );

  it.each([
    'https://evil.example',
    'http://evil.example/jobs',
    '//evil.example',
    '//evil.example/jobs',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' /jobs',
    '/\t/evil.example',
    'jobs',
    '',
  ])('rejects %j and falls back to /', (value) => {
    expect(safeRedirect(value)).toBe('/');
  });

  it('falls back to / for a missing or non-string value', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(42)).toBe('/');
  });

  it('uses the first value when the query repeats the key', () => {
    expect(safeRedirect(['/jobs', '/ung-vien'])).toBe('/jobs');
    expect(safeRedirect(['//evil.example', '/jobs'])).toBe('/');
    expect(safeRedirect([])).toBe('/');
  });
});

describe('signInPath', () => {
  it('encodes the full path into redirect', () => {
    expect(signInPath('/')).toBe('/sign-in?redirect=%2F');
    expect(signInPath('/jobs?status=open&page=2')).toBe(
      '/sign-in?redirect=%2Fjobs%3Fstatus%3Dopen%26page%3D2',
    );
  });

  it('adds expired=1 after a session expiry', () => {
    expect(signInPath('/jobs', { expired: true })).toBe('/sign-in?redirect=%2Fjobs&expired=1');
  });
});
