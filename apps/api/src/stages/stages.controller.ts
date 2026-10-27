import { type JobStages, STAGE_NAME_INVALID, stagePlanSaveSchema } from '@ats/shared';
import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Actor } from '../access/decorators.js';
import { jobNotFound } from '../access/jobs.access.js';
import type { WorkspaceActor } from '../access/resolve-access.js';
import { StagesService } from './stages.service.js';
import { StagesSaveService, stagePlanRejected } from './stages-save.service.js';

@Controller('api/jobs')
export class StagesController {
  constructor(
    private readonly stages: StagesService,
    private readonly stagesSave: StagesSaveService,
  ) {}

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

  /**
   * Saves the Quy trình tab's draft (decisions §6). Body `stagePlanSaveSchema`
   * (`{ version, stages: [{ id?, tempId?, name, retired, retireTargetId? }] }`); answers 200 with
   * the same body as `GET`, `version` + 1. 400 `VALIDATION_FAILED`; 422 `STAGE_NAME_INVALID` when
   * only names are wrong (blank or too long); 403 `FORBIDDEN` for collaborators; 404
   * `JOB_NOT_FOUND` for a missing or hidden job; 409 `JOB_VERSION_STALE`; 422
   * `STAGE_PLAN_INVALID`, `STAGE_PLAN_NO_ACTIVE_STAGE` or `STAGE_RETIRE_TARGET_INVALID`. 401 / 403
   * from the global access guard.
   */
  @Put(':id/stages')
  save(
    @Actor() actor: WorkspaceActor,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<JobStages> {
    const parsed = stagePlanSaveSchema.safeParse(body);
    if (!parsed.success) {
      const onlyNames = parsed.error.issues.every(
        ({ path }) => path.length === 3 && path[0] === 'stages' && path[2] === 'name',
      );
      if (onlyNames) throw stagePlanRejected(STAGE_NAME_INVALID);
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid stage plan' });
    }
    return this.stagesSave.save(actor, id, parsed.data);
  }
}
