import { changeJobStatusRequestSchema, type JobHeader } from '@ats/shared';
import { BadRequestException, Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Actor } from '../access/decorators.js';
import type { WorkspaceActor } from '../access/resolve-access.js';
import { JobStatusService } from './job-status.service.js';

@Controller('api/jobs')
export class JobStatusController {
  constructor(private readonly jobStatus: JobStatusService) {}

  /**
   * Opens, pauses, closes or reopens a job (decisions §5). Body `{ to, version }`; answers 200
   * with the job page header (new status, `version` + 1). 400 `VALIDATION_FAILED`, 403
   * `FORBIDDEN` for collaborators, 404 `JOB_NOT_FOUND` for a missing or hidden job, 409
   * `JOB_VERSION_STALE`, `JOB_STATUS_TRANSITION_INVALID` or `JOB_NOT_READY`. 401 / 403 from the
   * global access guard.
   */
  @Post(':id/status')
  @HttpCode(200)
  change(
    @Actor() actor: WorkspaceActor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<JobHeader> {
    const parsed = changeJobStatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid job status change',
      });
    }
    return this.jobStatus.change(actor, id, parsed.data);
  }
}
