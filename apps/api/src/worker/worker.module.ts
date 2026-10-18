import { type DynamicModule, Module } from '@nestjs/common';
import { PING_QUEUE } from '../queue/ping.queue.js';
import { QueueModule } from '../queue/queue.module.js';
import { PingProcessor } from './ping.processor.js';
import type { WorkerConfig } from './worker-config.js';

export interface WorkerModuleOptions {
  /** Redis key prefix for every queue (tests isolate runs with it). */
  queuePrefix?: string;
}

/** Root module in worker mode: queue connection plus every processor. No controllers, no HTTP. */
@Module({})
export class WorkerModule {
  static forRoot(config: WorkerConfig, options: WorkerModuleOptions = {}): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        QueueModule.forRoot({ redisUrl: config.redisUrl, prefix: options.queuePrefix }),
        QueueModule.register(PING_QUEUE),
      ],
      providers: [PingProcessor],
    };
  }
}
