import { describe, expect, it } from 'vitest';
import { diffKeys, flattenMessages } from './keys';
import en from './locales/en.json';
import vi from './locales/vi.json';

describe('locale files', () => {
  it('vi.json and en.json have exactly the same keys', () => {
    expect(diffKeys(vi, en)).toEqual({ missingInB: [], missingInA: [] });
  });

  it('every message is a non-empty string', () => {
    for (const messages of [vi, en]) {
      for (const [key, value] of flattenMessages(messages)) {
        expect(typeof value, key).toBe('string');
        expect(String(value).trim(), key).not.toBe('');
      }
    }
  });

  it('defines errors.unknown', () => {
    expect(vi.errors.unknown).toBeTruthy();
    expect(en.errors.unknown).toBeTruthy();
  });
});

describe('diffKeys', () => {
  it('reports a key missing from either side', () => {
    const a = { common: { save: 'Lưu', cancel: 'Hủy' }, only: { a: 'x' } };
    const b = { common: { save: 'Save' }, extra: 'y' };

    expect(diffKeys(a, b)).toEqual({
      missingInB: ['common.cancel', 'only.a'],
      missingInA: ['extra'],
    });
  });

  it('treats a leaf on one side and a namespace on the other as different keys', () => {
    expect(diffKeys({ errors: 'x' }, { errors: { unknown: 'y' } })).toEqual({
      missingInB: ['errors'],
      missingInA: ['errors.unknown'],
    });
  });
});
