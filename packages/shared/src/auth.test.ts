import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  localeSchema,
  meResponseSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
  RESEND_ERROR_CODES,
  RESET_PASSWORD_INVALID_PATH,
  RESET_PASSWORD_PATH,
  resendErrorSchema,
  VERIFY_EMAIL_EXPIRED_PATH,
  VERIFY_EMAIL_SUCCESS_PATH,
} from './index.js';

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

describe('verification email contract', () => {
  it('names the web pages the verification link lands on', () => {
    expect(VERIFY_EMAIL_SUCCESS_PATH).toBe('/verify-email/success');
    expect(VERIFY_EMAIL_EXPIRED_PATH).toBe('/verify-email/expired');
  });

  it('accepts the two resend refusals with the seconds to wait', () => {
    expect(RESEND_ERROR_CODES).toEqual(['RESEND_TOO_SOON', 'RESEND_LIMIT']);
    const body = { code: 'RESEND_TOO_SOON', message: 'RESEND_TOO_SOON', retryAfterSeconds: 42 };
    expect(resendErrorSchema.parse(body)).toEqual({
      code: 'RESEND_TOO_SOON',
      retryAfterSeconds: 42,
    });
  });

  it('rejects another code or a missing or zero wait', () => {
    expect(resendErrorSchema.safeParse({ code: 'OTHER', retryAfterSeconds: 1 }).success).toBe(
      false,
    );
    expect(resendErrorSchema.safeParse({ code: 'RESEND_LIMIT' }).success).toBe(false);
    expect(
      resendErrorSchema.safeParse({ code: 'RESEND_LIMIT', retryAfterSeconds: 0 }).success,
    ).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts 8 to 128 characters (decisions §2, Better Auth limits)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
  });

  it('rejects a 7-character or a too long password with an error code', () => {
    const short = passwordSchema.safeParse('1234567');
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.message).toBe('PASSWORD_TOO_SHORT');
    const long = passwordSchema.safeParse('x'.repeat(129));
    expect(long.error?.issues[0]?.message).toBe('PASSWORD_TOO_LONG');
  });
});

describe('password reset contract', () => {
  it('names the web pages the reset link lands on', () => {
    expect(RESET_PASSWORD_PATH).toBe('/reset-password');
    expect(RESET_PASSWORD_INVALID_PATH).toBe('/reset-password/invalid');
  });
});
