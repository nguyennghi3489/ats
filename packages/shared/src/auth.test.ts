import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, localeSchema, meResponseSchema } from './index.js';

const user = {
  id: 'usr_1',
  name: 'Lan Nguyen',
  email: 'lan@example.test',
  locale: 'vi',
  emailVerified: true,
};

describe('localeSchema', () => {
  it('accepts vi and en and defaults to vi', () => {
    expect(localeSchema.options).toEqual(['vi', 'en']);
    expect(DEFAULT_LOCALE).toBe('vi');
  });

  it('rejects any other language', () => {
    expect(localeSchema.safeParse('fr').success).toBe(false);
  });
});

describe('meResponseSchema', () => {
  it('accepts the current user', () => {
    expect(meResponseSchema.parse({ user })).toEqual({ user });
  });

  it('drops fields the API must not expose', () => {
    expect(meResponseSchema.parse({ user: { ...user, image: null, password: 'x' } })).toEqual({
      user,
    });
  });

  it('rejects an unknown locale or a missing field', () => {
    expect(meResponseSchema.safeParse({ user: { ...user, locale: 'fr' } }).success).toBe(false);
    const withoutEmail: Partial<typeof user> = { ...user };
    delete withoutEmail.email;
    expect(meResponseSchema.safeParse({ user: withoutEmail }).success).toBe(false);
  });
});
