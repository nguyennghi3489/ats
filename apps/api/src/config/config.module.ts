import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';

/** Injection token for the validated `AppConfig`: `@Inject(APP_CONFIG) config: AppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Makes the config validated in `main.ts` injectable everywhere. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
