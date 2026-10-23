import { jobListQuerySchema, type JobListResponse } from '@ats/shared';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Actor } from '../access/decorators.js';
import type { WorkspaceActor } from '../access/resolve-access.js';
import { JobsListService } from './jobs-list.service.js';

@Controller('api/jobs')
export class JobsListController {
  constructor(private readonly jobsList: JobsListService) {}

  /**
   * One page (25) of the jobs the caller may see in the active workspace, newest first. Query
   * `q` (title or code), `status` (`active` by default, or one status) and `page` (1-based).
   * 400 `VALIDATION_FAILED`; 401 / 403 from the global access guard.
   */
  @Get()
  list(@Actor() actor: WorkspaceActor, @Query() query: unknown): Promise<JobListResponse> {
    const parsed = jobListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid job list query',
      });
    }
    return this.jobsList.list(actor, parsed.data);
  }
}
