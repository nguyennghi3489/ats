import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDatabase, type Database } from './database.js';

/** Injection token for the shared `Database`: `@Inject(DATABASE) database: Database`. */
export const DATABASE = Symbol('DATABASE');

/**
 * One connection pool for the whole process, injectable everywhere. Connections open lazily, so
 * the API starts (and `/health` reports `db: "down"`) while Postgres is unreachable.
 */
@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  static forRoot(options: { url: string }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DATABASE, useFactory: () => createDatabase({ url: options.url }) }],
      exports: [DATABASE],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}
