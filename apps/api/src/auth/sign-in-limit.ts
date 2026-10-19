import { createHmac } from 'node:crypto';
import { SIGN_IN_RATE_LIMITED, type SignInRateLimitedError } from '@ats/shared';
import type { LoggerService } from '@nestjs/common';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import type { Redis } from 'ioredis';

/** Better Auth path (under its base path) of the email + password sign-in. */
export const EMAIL_SIGN_IN_PATH = '/sign-in/email';

/** Failed email + password sign-ins allowed per (client IP, email) in one window (decisions §2). */
export const SIGN_IN_LIMIT_MAX_FAILURES = 10;
/** Length of the fixed window, counted from the first failure (decisions §2). */
export const SIGN_IN_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Request header carrying the client IP Nest resolved (`req.ip`, honouring `trust proxy`). The auth
 * middleware always overwrites it, so a client cannot choose its own IP.
 */
export const CLIENT_IP_HEADER = 'x-ats-client-ip';

export interface SignInLimitOptions {
  /** Keys the hash that names each counter, so Redis never holds an email address or IP. */
  secret: string;
  maxFailures?: number;
  windowMs?: number;
  /** Redis key prefix. Tests use a unique one. */
  keyPrefix?: string;
  /** Clock in epoch ms. The window is measured with it, so tests can move time. */
  now?: () => number;
}

export type SignInLimitStatus = { blocked: false } | { blocked: true; retryAfterSeconds: number };

/** The form counters are keyed on: Better Auth matches emails case-insensitively too. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Reserves one attempt, atomically, before the password is checked: starts a new window (count 1)
// when there is none or the last one has passed; refuses when the window already holds the maximum;
// otherwise increments it. Doing check and count in one step means attempts that arrive together
// cannot all see a count below the maximum. The key expires when its window ends.
// KEYS[1] counter; ARGV[1] now (ms); ARGV[2] window (ms); ARGV[3] maximum.
// Returns 0 when the attempt is allowed, otherwise the ms left in the window.
const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local start = tonumber(redis.call('HGET', KEYS[1], 'start'))
if start == nil or now - start >= window or now < start then
  start = now
  redis.call('HSET', KEYS[1], 'start', start, 'count', 1)
else
  local count = tonumber(redis.call('HGET', KEYS[1], 'count')) or 0
  if count >= max then
    return math.max(1, start + window - now)
  end
  redis.call('HINCRBY', KEYS[1], 'count', 1)
end
redis.call('PEXPIRE', KEYS[1], math.max(1, start + window - now))
return 0
`;

// Gives back a reserved attempt whose outcome was not a wrong password. Never goes below zero and
// never recreates an expired counter. KEYS[1] counter.
const RELEASE_SCRIPT = `
local count = tonumber(redis.call('HGET', KEYS[1], 'count'))
if count ~= nil and count > 0 then
  redis.call('HINCRBY', KEYS[1], 'count', -1)
end
return 1
`;

/**
 * Counts email + password sign-in attempts in Redis per (client IP, normalized email) in a fixed
 * window that starts at the first attempt. `acquire` reserves an attempt before the password is
 * checked, or reports the pair blocked until the window ends once it holds the maximum. A wrong
 * password keeps its reservation as a failure; any other refusal calls `release`; a successful
 * sign-in calls `reset` for its own pair only.
 */
export class SignInLimiter {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(
    private readonly redis: Redis,
    private readonly options: SignInLimitOptions,
  ) {
    this.maxFailures = options.maxFailures ?? SIGN_IN_LIMIT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? SIGN_IN_LIMIT_WINDOW_MS;
    this.keyPrefix = options.keyPrefix ?? 'sign-in-limit:';
    this.now = options.now ?? (() => Date.now());
  }

  async acquire(ip: string, email: string): Promise<SignInLimitStatus> {
    const msLeft = Number(
      await this.redis.eval(
        ACQUIRE_SCRIPT,
        1,
        this.key(ip, email),
        this.now(),
        this.windowMs,
        this.maxFailures,
      ),
    );
    if (msLeft <= 0) {
      return { blocked: false };
    }
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) };
  }

  async release(ip: string, email: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key(ip, email));
  }

  async reset(ip: string, email: string): Promise<void> {
    await this.redis.del(this.key(ip, email));
  }

  /** `<prefix><hmac(ip, email)>`: neither the address nor the IP appears in Redis. */
  private key(ip: string, email: string): string {
    const digest = createHmac('sha256', this.options.secret)
      .update(`${ip}\n${normalizeEmail(email)}`)
      .digest('base64url');
    return `${this.keyPrefix}${digest}`;
  }
}

interface SignInAttempt {
  ip: string;
  email: string;
}

type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * The (client IP, email) of an HTTP email sign-in, or `undefined` for any other endpoint and for
 * server-side calls, which carry no client IP header.
 */
function signInAttempt(ctx: AuthHookContext): SignInAttempt | undefined {
  if (ctx.path !== EMAIL_SIGN_IN_PATH) {
    return undefined;
  }
  const ip = ctx.headers?.get(CLIENT_IP_HEADER);
  const body: unknown = ctx.body;
  const email =
    typeof body === 'object' && body !== null && 'email' in body ? body.email : undefined;
  if (!ip || typeof email !== 'string' || email.trim() === '') {
    return undefined;
  }
  return { ip, email };
}

/**
 * Better Auth `hooks` applying the limit to `POST /sign-in/email`:
 * - before: reserves an attempt for the (IP, email) atomically, so parallel attempts cannot get
 *   past the maximum. A blocked pair gets 429 `SIGN_IN_RATE_LIMITED` with `retryAfterSeconds` and a
 *   `Retry-After` header; the password is never checked.
 * - after: a 401 (wrong email or password) keeps its reservation as a failure; a successful sign-in
 *   resets the counter of its own (IP, email); other refusals (unverified email, bad input) give
 *   the reservation back.
 *
 * If Redis cannot be reached the attempt goes through unlimited and a warning is logged: the limit
 * slows guessing down, it must not lock everyone out. Log lines never include the email address.
 */
export function signInLimitHooks(limiter: SignInLimiter, logger: LoggerService) {
  const warn = (action: string, error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Sign-in limit ${action} failed: ${reason}`, 'SignInLimit');
  };

  return {
    before: createAuthMiddleware(async (ctx) => {
      const attempt = signInAttempt(ctx);
      if (!attempt) {
        return;
      }
      let status: SignInLimitStatus = { blocked: false };
      try {
        status = await limiter.acquire(attempt.ip, attempt.email);
      } catch (error) {
        warn('check', error);
      }
      if (status.blocked) {
        const body: SignInRateLimitedError = {
          code: SIGN_IN_RATE_LIMITED,
          message: 'Too many failed sign-ins. Try again later.',
          retryAfterSeconds: status.retryAfterSeconds,
        };
        throw new APIError('TOO_MANY_REQUESTS', body, {
          'Retry-After': String(status.retryAfterSeconds),
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const attempt = signInAttempt(ctx);
      const returned = ctx.context.returned;
      if (!attempt || returned === undefined) {
        return;
      }
      try {
        if (!isAPIError(returned)) {
          await limiter.reset(attempt.ip, attempt.email);
        } else if (returned.statusCode !== 401 && returned.statusCode !== 429) {
          await limiter.release(attempt.ip, attempt.email);
        }
      } catch (error) {
        warn('update', error);
      }
    }),
  };
}
