import { Module } from '@nestjs/common';

/**
 * Jobs (decisions §5–6); the tables are in `jobs.schema.ts`. The jobs endpoints add their
 * controllers and providers here; the database is global.
 */
@Module({})
export class JobsModule {}
