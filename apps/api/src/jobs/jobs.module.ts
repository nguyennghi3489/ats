import { Module } from '@nestjs/common';
import { JobsListController } from './jobs-list.controller.js';
import { JobsListService } from './jobs-list.service.js';

/**
 * Jobs (decisions §5–6); the tables are in `jobs.schema.ts`. `GET /api/jobs` lists the visible
 * ones. The jobs endpoints add their controllers and providers here; the database is global.
 */
@Module({
  controllers: [JobsListController],
  providers: [JobsListService],
})
export class JobsModule {}
