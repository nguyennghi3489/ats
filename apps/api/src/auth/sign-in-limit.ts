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

// Adds one failure: starts a new window (count 1) when there is none or the last one has passed,
// otherwise increments it. The key expires when its window ends, so Redis cleans up after itself.
// KEYS[1] counter; ARGV[1] now (ms); ARGV[2] window (ms).
const RECORD_FAILURE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local start = tonumber(redis.call('HGET', KEYS[1], 'start'))
if start == nil or now - start >= window or now < start then
  start = now
  redis.call('HSET', KEYS[1], 'start', start, 'count', 1)
else
  redis.call('HINCRBY', KEYS[1], 'count', 1)
end
redis.call('PEXPIRE', KEYS[1], math.max(1, start + window - now))
return 1
`;

/**
 * Counts failed email + password sign-ins in Redis per (client IP, normalized email) in a fixed
 * window that starts at the first failure. Once the count reaches the maximum, `check` reports the
 * pair blocked until the window ends. A successful sign-in calls `reset` for its own pair only.
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

  async check(ip: string, email: string): Promise<SignInLimitStatus> {
    const [start, count] = await this.redis.hmget(this.key(ip, email), 'start', 'count');
    if (start === null || count === null) {
      return { blocked: false };
    }
    const startedAt = Number(start);
    const endsAt = startedAt + this.windowMs;
    const now = this.now();
    if (now >= endsAt || now < startedAt || Number(count) < this.maxFailures) {
      return { blocked: false };
    }
    return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now) / 1000)) };
  }

  async recordFailure(ip: string, email: string): Promise<void> {
    await this.redis.eval(RECORD_FAILURE_SCRIPT, 1, this.key(ip, email), this.now(), this.windowMs);
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
 * - before: a blocked (IP, email) gets 429 `SIGN_IN_RATE_LIMITED` with `retryAfterSeconds` and a
 *   `Retry-After` header; the password is never checked.
 * - after: a 401 (wrong email or password) counts as a failure; a successful sign-in resets the
 *   counter of its own (IP, email). Other refusals (unverified email, bad input) do not count.
 * Both run before the response is sent, so the next request always sees the new count.
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
        status = await limiter.check(attempt.ip, attempt.email);
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
        } else if (returned.statusCode === 401) {
          await limiter.recordFailure(attempt.ip, attempt.email);
        }
      } catch (error) {
        warn('update', error);
      }
    }),
  };
}
