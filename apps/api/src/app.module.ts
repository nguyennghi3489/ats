import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import type { AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot({ url: config.databaseUrl }),
        HealthModule,
        AuthModule,
      ],
    };
  }
}
