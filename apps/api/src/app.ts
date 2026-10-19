import 'reflect-metadata';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type AppModuleOptions } from './app.module.js';
import type { AppConfig } from './config/config.js';
import { AllExceptionsFilter } from './http/all-exceptions.filter.js';
import { requestIdMiddleware } from './http/request-id.middleware.js';
import { JsonLogger, logLevelsFrom } from './logging/json-logger.js';

/** Cross-cutting HTTP setup shared by `main.ts` and tests: logger, request ids, error bodies. */
export function configureApp(app: INestApplication, logger: LoggerService): INestApplication {
  app.useLogger(logger);
  app.use(requestIdMiddleware(logger));
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();
  return app;
}

/** Builds the API without listening. `main.ts` calls `listen`; tests listen on a random port. */
export async function createApp(
  config: AppConfig,
  logger: LoggerService = new JsonLogger({ logLevels: logLevelsFrom(config.logLevel) }),
  options: AppModuleOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, options), {
    logger,
    bufferLogs: true,
  });
  app.disable('x-powered-by');
  if (config.trustProxy) {
    // Behind Caddy: `req.ip` is the address Caddy appended to X-Forwarded-For (one trusted hop),
    // so a client cannot spoof it by sending its own header.
    app.set('trust proxy', 1);
  }
  return configureApp(app, logger);
}
