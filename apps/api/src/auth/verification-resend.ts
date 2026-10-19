import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { ResendErrorCode } from '@ats/shared';
import type { Redis } from 'ioredis';

/** Email verification rules (decisions §2). */
export const VERIFICATION_LINK_EXPIRES_IN_SECONDS = 24 * 60 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const RESEND_WINDOW_SECONDS = 60 * 60;
export const RESEND_MAX_PER_WINDOW = 5;

export type ResendDecision =
  { allowed: true } | { allowed: false; code: ResendErrorCode; retryAfterSeconds: number };

export interface VerificationResendOptions {
  /** Keys the email hash, so the hash of a known address cannot be computed without it. */
  secret: string;
  /** First part of every Redis key (tests isolate runs with it). */
  keyPrefix: string;
}

/** The form of an address the limits are counted for: `New.User@X.test` = `new.user@x.test`. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Atomically: forget sends older than the window, refuse within the cooldown or at the limit
 * (returning the code and the milliseconds to wait), otherwise record this send.
 * KEYS[1] sorted set of send times; ARGV now, cooldown ms, window ms, max sends, member.
 */
const TAKE_SCRIPT = `
local now = tonumber(ARGV[1])
local cooldown = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local max = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local last = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
if last[2] and now - tonumber(last[2]) < cooldown then
  return {1, tonumber(last[2]) + cooldown - now}
end
if redis.call('ZCARD', KEYS[1]) >= max then
  local first = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {2, tonumber(first[2]) + window - now}
end
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('PEXPIRE', KEYS[1], window)
return {0, 0}
`;

const REFUSALS: Record<number, ResendErrorCode> = { 1: 'RESEND_TOO_SOON', 2: 'RESEND_LIMIT' };

/**
 * Resend limits and the current verification link per email, in Redis. Keys carry an HMAC of
 * the normalized address, never the address; values are send times and a token hash.
 *
 * Better Auth's verification tokens are stateless JWTs, so "a new link invalidates the old one"
 * is enforced here: only the newest token issued for an email is accepted.
 */
export class VerificationResend {
  constructor(
    private readonly redis: Redis,
    private readonly options: VerificationResendOptions,
  ) {}

  /** Counts a send if the limits allow it; otherwise says which limit and how long to wait. */
  async take(email: string, now: number = Date.now()): Promise<ResendDecision> {
    const [outcome, waitMs] = (await this.redis.eval(
      TAKE_SCRIPT,
      1,
      this.sendsKey(email),
      now,
      RESEND_COOLDOWN_SECONDS * 1_000,
      RESEND_WINDOW_SECONDS * 1_000,
      RESEND_MAX_PER_WINDOW,
      `${now}:${randomUUID()}`,
    )) as [number, number];
    const code = REFUSALS[outcome];
    if (code === undefined) return { allowed: true };
    return { allowed: false, code, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1_000)) };
  }

  /** Counts a send that is not subject to the limits (the email sent on sign-up). */
  async record(email: string, now: number = Date.now()): Promise<void> {
    const key = this.sendsKey(email);
    await this.redis
      .multi()
      .zremrangebyscore(key, '-inf', now - RESEND_WINDOW_SECONDS * 1_000)
      .zadd(key, now, `${now}:${randomUUID()}`)
      .pexpire(key, RESEND_WINDOW_SECONDS * 1_000)
      .exec();
  }

  /** Makes `token` the only link that verifies `email`; earlier links stop working. */
  async setCurrentLink(email: string, token: string): Promise<void> {
    await this.redis.set(
      this.linkKey(email),
      tokenHash(token),
      'EX',
      VERIFICATION_LINK_EXPIRES_IN_SECONDS,
    );
  }

  /** Whether `token` is the newest link issued for `email`. */
  async isCurrentLink(email: string, token: string): Promise<boolean> {
    return (await this.redis.get(this.linkKey(email))) === tokenHash(token);
  }

  private sendsKey(email: string): string {
    return `${this.options.keyPrefix}:verify-email:sends:${this.emailHash(email)}`;
  }

  private linkKey(email: string): string {
    return `${this.options.keyPrefix}:verify-email:link:${this.emailHash(email)}`;
  }

  private emailHash(email: string): string {
    return createHmac('sha256', this.options.secret).update(normalizeEmail(email)).digest('hex');
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
