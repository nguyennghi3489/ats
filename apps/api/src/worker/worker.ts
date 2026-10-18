import 'reflect-metadata';
import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JsonLogger, logLevelsFrom } from '../logging/json-logger.js';
import type { WorkerConfig } from './worker-config.js';
import { WorkerModule, type WorkerModuleOptions } from './worker.module.js';

/**
 * Starts the API codebase in worker mode (decisions §1): a Nest application context with the
 * processors and no HTTP listener. On SIGTERM/SIGINT Nest closes the context; each BullMQ worker
 * stops taking jobs and waits for the active one to finish before the process exits.
 */
export async function createWorker(
  config: WorkerConfig,
  logger: LoggerService = new JsonLogger({ logLevels: logLevelsFrom(config.logLevel) }),
  options: WorkerModuleOptions = {},
): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config, options), {
    logger,
    bufferLogs: true,
  });
  app.useLogger(logger);
  app.enableShutdownHooks();
  return app;
}
