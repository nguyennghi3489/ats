import { Module } from '@nestjs/common';
import { StagesController } from './stages.controller.js';
import { StagesService } from './stages.service.js';

/**
 * Job stages (decisions §6); the table is `job_stages` in `jobs/jobs.schema.ts`. The database is
 * global.
 * - `GET /api/jobs/:id/stages`: the job's active and retired stages.
 */
@Module({
  controllers: [StagesController],
  providers: [StagesService],
})
export class StagesModule {}
