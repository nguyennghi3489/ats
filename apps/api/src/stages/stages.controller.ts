import type { JobStages } from '@ats/shared';
import { Controller, Get, Param } from '@nestjs/common';
import { Actor } from '../access/decorators.js';
import { jobNotFound } from '../access/jobs.access.js';
import type { WorkspaceActor } from '../access/resolve-access.js';
import { StagesService } from './stages.service.js';

@Controller('api/jobs')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  /**
   * The job's stages for the Quy trình tab: `{ jobId, version, canEdit, active, retired }`. Anyone
   * who sees the job reads them; `canEdit` says whether they may change them. A missing job, a
   * hidden one, one of another workspace and a non-uuid id all answer the same 404
   * `JOB_NOT_FOUND` (decisions §3). 401 / 403 come from the global access guard.
   */
  @Get(':id/stages')
  async get(@Actor() actor: WorkspaceActor, @Param('id') id: string): Promise<JobStages> {
    const stages = await this.stages.find(actor, id);
    if (!stages) throw jobNotFound();
    return stages;
  }
}
