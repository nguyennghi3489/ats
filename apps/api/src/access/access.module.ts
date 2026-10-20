import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';

/**
 * Registers `AccessGuard` as the one global guard (decisions §3). Pass the root's
 * `AuthModule.forRoot(...)` module (the same object, so Nest shares its instance) for the session
 * cookie name; the database and config are global.
 */
@Module({})
export class AccessModule {
  static forRoot(authModule: DynamicModule): DynamicModule {
    return {
      module: AccessModule,
      imports: [authModule],
      providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
    };
  }
}
