import {
  Inject,
  Injectable,
  Logger,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  type OnApplicationShutdown,
  RequestMethod,
} from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { type Auth, createAuth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import { MeController } from './me.controller.js';
import { CLIENT_IP_HEADER, SignInLimiter } from './sign-in-limit.js';

export { AUTH } from './auth.tokens.js';

/** Redis connection holding the failed sign-in counters. */
const SIGN_IN_LIMIT_REDIS = Symbol('SIGN_IN_LIMIT_REDIS');

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

/** Closes the sign-in limit Redis connection when the app shuts down. */
@Injectable()
class SignInLimitRedisCloser implements OnApplicationShutdown {
  constructor(@Inject(SIGN_IN_LIMIT_REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/** Better Auth under `/api/auth/*` (sign-up, sign-in, sign-out, session) and `GET /api/me`. */
@Module({
  controllers: [MeController],
  providers: [
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
      provide: AUTH,
      inject: [APP_CONFIG, DATABASE, SIGN_IN_LIMIT_REDIS],
      useFactory: (config: AppConfig, database: Database, redis: Redis) =>
        createAuth(
          config,
          database.db,
          new SignInLimiter(redis, { secret: config.betterAuthSecret }),
        ),
    },
    AuthHandlerMiddleware,
  ],
  exports: [AUTH],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthHandlerMiddleware)
      .forRoutes({ path: 'api/auth/*path', method: RequestMethod.ALL });
  }
}
