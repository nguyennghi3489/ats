import { describe, expect, it } from 'vitest';
import { APPLICATION_CODE_PREFIX, CODE_KINDS, CODE_MIN_DIGITS, formatCode } from './index.js';

describe('formatCode', () => {
  it.each([
    ['AN', 1, 'AN-001'],
    ['AN', 7, 'AN-007'],
    ['AN', 42, 'AN-042'],
    ['AN', 999, 'AN-999'],
    ['AN', 1000, 'AN-1000'],
    ['AN', 1234, 'AN-1234'],
    ['ỨT', 3, 'ỨT-003'],
  ])('formatCode(%s, %i) → %s', (prefix, n, code) => {
    expect(formatCode(prefix, n)).toBe(code);
  });

  it('pads to at least three digits', () => {
    expect(CODE_MIN_DIGITS).toBe(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s, which is not a counter value',
    (n) => {
      expect(() => formatCode('AN', n)).toThrow(RangeError);
    },
  );
});

describe('code constants', () => {
  it('uses ỨT for application codes', () => {
    expect(APPLICATION_CODE_PREFIX).toBe('ỨT');
  });

  it('counts jobs and applications separately', () => {
    expect(CODE_KINDS).toEqual(['job', 'application']);
  });
});
