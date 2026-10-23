import { Module } from '@nestjs/common';
import { JobHeaderController } from './job-header.controller.js';
import { JobHeaderService } from './job-header.service.js';
import { JobsListController } from './jobs-list.controller.js';
import { JobsListService } from './jobs-list.service.js';

/**
 * Jobs (decisions §5–6); the tables are in `jobs.schema.ts`. The jobs endpoints add their
 * controllers and providers here; the database is global.
 * - `GET /api/jobs`: the visible jobs.
 * - `GET /api/jobs/:id`: the job page header.
 */
@Module({
  controllers: [JobsListController, JobHeaderController],
  providers: [JobsListService, JobHeaderService],
})
export class JobsModule {}
