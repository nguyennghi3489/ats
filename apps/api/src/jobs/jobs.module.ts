import { Module } from '@nestjs/common';
import { JobHeaderController } from './job-header.controller.js';
import { JobHeaderService } from './job-header.service.js';

/**
 * Jobs (decisions §5–6); the tables are in `jobs.schema.ts`. The jobs endpoints add their
 * controllers and providers here; the database is global.
 * - `GET /api/jobs/:id`: the job page header.
 */
@Module({
  controllers: [JobHeaderController],
  providers: [JobHeaderService],
})
export class JobsModule {}
