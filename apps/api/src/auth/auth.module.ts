import {
  type DynamicModule,
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
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
    await this.handler(req, res);
  }
}

/** Redis connection for the verification-email resend limits and current links. */
const AUTH_REDIS = Symbol('AUTH_REDIS');

export interface AuthModuleOptions {
  /** First part of the auth Redis keys (tests isolate runs with it). */
  redisKeyPrefix: string;
}

/**
 * Better Auth under `/api/auth/*` (sign-up with the verification email, verification, resend,
 * sign-in, sign-out, session) and `GET /api/me`. Needs `QueueModule.forRoot` at the root.
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
          provide: VerificationResend,
          inject: [AUTH_REDIS, APP_CONFIG],
          useFactory: (redis: Redis, config: AppConfig) =>
            new VerificationResend(redis, {
              secret: config.betterAuthSecret,
              keyPrefix: options.redisKeyPrefix,
            }),
        },
        {
          provide: AUTH,
          inject: [APP_CONFIG, DATABASE, EmailService, VerificationResend],
          useFactory: (
            config: AppConfig,
            database: Database,
            emails: EmailService,
            resend: VerificationResend,
          ) => createAuth(config, database.db, { emails, resend }),
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
