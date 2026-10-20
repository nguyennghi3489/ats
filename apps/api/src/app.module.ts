import { type DynamicModule, Module } from '@nestjs/common';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import type { AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { QueueModule } from './queue/queue.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

export interface AppModuleOptions {
  /**
   * Prefix of every Redis key the API writes (queues and auth counters). Tests use a unique one;
   * otherwise queues keep BullMQ's default and auth keys start with `ats`.
   */
  redisPrefix?: string;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    const auth = AuthModule.forRoot({ redisKeyPrefix: options.redisPrefix ?? 'ats' });
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot({ url: config.databaseUrl }),
        QueueModule.forRoot({ redisUrl: config.redisUrl, prefix: options.redisPrefix }),
        HealthModule,
        auth,
        AccessModule.forRoot(auth),
        WorkspacesModule.forRoot(auth),
      ],
    };
  }
}
