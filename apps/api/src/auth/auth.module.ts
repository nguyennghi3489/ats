import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  RequestMethod,
} from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import { type Auth, createAuth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import { MeController } from './me.controller.js';
import { createPasswordResetLimits } from './password-reset.js';
import { CLIENT_IP_HEADER, SignInLimiter } from './sign-in-limit.js';
import { VerificationResend } from './verification-resend.js';

export { AUTH } from './auth.tokens.js';

/** Hands every `/api/auth/*` request to Better Auth, which writes the whole response. */
@Injectable()
class AuthHandlerMiddleware implements NestMiddleware {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(AUTH) auth: Auth) {
    this.handler = toNodeHandler(auth);
  }

  async use(req: Request, res: Response): Promise<void> {
    // Always overwritten: Better Auth and the sign-in limit read the client IP from this header.
    // `req.ip` follows X-Forwarded-For only when `trust proxy` is on (TRUST_PROXY, behind Caddy).
    req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    await this.handler(req, res);
  }
}

/** Redis connection for the verification-email resend limits and current links. */
const AUTH_REDIS = Symbol('AUTH_REDIS');

/** Password reset request limits (60 s / 5 per hour per email), on the auth Redis connection. */
const PASSWORD_RESET_LIMITS = Symbol('PASSWORD_RESET_LIMITS');

/** Redis connection holding the failed sign-in counters. */
const SIGN_IN_LIMIT_REDIS = Symbol('SIGN_IN_LIMIT_REDIS');

/** Closes the sign-in limit Redis connection when the app shuts down. */
@Injectable()
class SignInLimitRedisCloser implements OnApplicationShutdown {
  constructor(@Inject(SIGN_IN_LIMIT_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

export interface AuthModuleOptions {
  /** First part of the auth Redis keys (tests isolate runs with it). */
  redisKeyPrefix: string;
}

/**
 * Better Auth under `/api/auth/*` (sign-up with the verification email, verification, resend,
 * sign-in with the failed sign-in limit, sign-out, session, password reset) and `GET /api/me`. Needs
 * `QueueModule.forRoot` at the root.
 */
@Module({})
export class AuthModule implements NestModule, OnModuleDestroy {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: [EmailModule],
      controllers: [MeController],
      providers: [
        {
          provide: AUTH_REDIS,
          inject: [APP_CONFIG],
          useFactory: (config: AppConfig) => new Redis(config.redisUrl),
        },
        {
          provide: SIGN_IN_LIMIT_REDIS,
          inject: [APP_CONFIG],
          useFactory: (config: AppConfig) => {
            const logger = new Logger('SignInLimit');
            // One retry per command: when Redis is down a sign-in waits briefly, then goes through
            // unlimited (see `signInLimitHooks`) instead of hanging.
            const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
            redis.on('error', (error: Error) => logger.warn(`Redis error: ${error.message}`));
            return redis;
          },
        },
        SignInLimitRedisCloser,
        {
          provide: VerificationResend,
          inject: [AUTH_REDIS, APP_CONFIG],
          useFactory: (redis: Redis, config: AppConfig) =>
            new VerificationResend(redis, {
              secret: config.betterAuthSecret,
              keyPrefix: options.redisKeyPrefix,
            }),
        },
        {
          provide: PASSWORD_RESET_LIMITS,
          inject: [AUTH_REDIS, APP_CONFIG],
          useFactory: (redis: Redis, config: AppConfig) =>
            createPasswordResetLimits(redis, {
              secret: config.betterAuthSecret,
              keyPrefix: options.redisKeyPrefix,
            }),
        },
        {
          provide: SignInLimiter,
          inject: [SIGN_IN_LIMIT_REDIS, APP_CONFIG],
          useFactory: (redis: Redis, config: AppConfig) =>
            new SignInLimiter(redis, {
              secret: config.betterAuthSecret,
              keyPrefix: `${options.redisKeyPrefix}:sign-in-limit:`,
            }),
        },
        {
          provide: AUTH,
          inject: [
            APP_CONFIG,
            DATABASE,
            EmailService,
            VerificationResend,
            PASSWORD_RESET_LIMITS,
            SignInLimiter,
          ],
          useFactory: (
            config: AppConfig,
            database: Database,
            emails: EmailService,
            resend: VerificationResend,
            resetLimits: VerificationResend,
            signInLimiter: SignInLimiter,
          ) => createAuth(config, database.db, { emails, resend, resetLimits, signInLimiter }),
        },
        AuthHandlerMiddleware,
      ],
      exports: [AUTH],
    };
  }

  constructor(@Inject(AUTH_REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthHandlerMiddleware)
      .forRoutes({ path: 'api/auth/*path', method: RequestMethod.ALL });
  }
}
