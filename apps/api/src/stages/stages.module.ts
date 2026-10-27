import { Module } from '@nestjs/common';
import { StagesController } from './stages.controller.js';
import { StagesService } from './stages.service.js';
import { StagesSaveService } from './stages-save.service.js';

/**
 * Job stages (decisions §6); the table is `job_stages` in `jobs/jobs.schema.ts`. The database is
 * global.
 * - `GET /api/jobs/:id/stages`: the job's active and retired stages.
 * - `PUT /api/jobs/:id/stages`: saves the Quy trình tab's draft in one transaction.
 */
@Module({
  controllers: [StagesController],
  providers: [StagesService, StagesSaveService],
})
export class StagesModule {}
