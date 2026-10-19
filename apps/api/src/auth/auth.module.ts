import {
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { type Auth, createAuth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import { MeController } from './me.controller.js';

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

/** Better Auth under `/api/auth/*` (sign-up, sign-in, sign-out, session) and `GET /api/me`. */
@Module({
  controllers: [MeController],
  providers: [
    {
      provide: AUTH,
      inject: [APP_CONFIG, DATABASE],
      useFactory: (config: AppConfig, database: Database) => createAuth(config, database.db),
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
