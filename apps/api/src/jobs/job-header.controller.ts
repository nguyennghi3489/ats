import type { JobHeader } from '@ats/shared';
import { Controller, Get, Param } from '@nestjs/common';
import { Actor } from '../access/decorators.js';
import { jobNotFound } from '../access/jobs.access.js';
import type { WorkspaceActor } from '../access/resolve-access.js';
import { JobHeaderService } from './job-header.service.js';

@Controller('api/jobs')
export class JobHeaderController {
  constructor(private readonly jobHeaders: JobHeaderService) {}

  /**
   * The job page header: `{ id, code, title, status, accessScope, owner, canEdit }`. A missing
   * job, a hidden one, one of another workspace and a non-uuid id all answer the same 404
   * `JOB_NOT_FOUND` (decisions §3). 401 / 403 come from the global access guard.
   */
  @Get(':id')
  async get(@Actor() actor: WorkspaceActor, @Param('id') id: string): Promise<JobHeader> {
    const header = await this.jobHeaders.find(actor, id);
    if (!header) throw jobNotFound();
    return header;
  }
}
