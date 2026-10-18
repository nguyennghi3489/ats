import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { type QueueDefinition, registerQueueOptions } from './queue-definition.js';

export interface QueueConnectionOptions {
  redisUrl: string;
  /** Redis key prefix. Tests use a unique one; everything else keeps BullMQ's default. */
  prefix?: string;
}

/**
 * Queues for producers (HTTP API, scripts) and the worker alike. Importing this module never
 * starts a worker: jobs are only processed where a `@Processor` provider is registered, which is
 * the worker module alone.
 *
 *   QueueModule.forRoot({ redisUrl })   once, at the root (global Redis connection)
 *   QueueModule.register(PING_QUEUE)    in each module that enqueues; inject with @InjectQueue
 */
@Module({})
export class QueueModule {
  static forRoot(options: QueueConnectionOptions): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({
          connection: { url: options.redisUrl },
          ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
        }),
      ],
    };
  }

  static register(...definitions: QueueDefinition[]): DynamicModule {
    const queues = BullModule.registerQueue(...definitions.map(registerQueueOptions));
    return { module: QueueModule, imports: [queues], exports: [queues] };
  }
}
