import {
  createWorkspaceRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  switchWorkspaceRequestSchema,
  type Workspace,
  type WorkspaceList,
} from '@ats/shared';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Actor, SessionOnly } from '../access/decorators.js';
import type { Actor as Caller } from '../access/resolve-access.js';
import { WorkspacesService } from './workspaces.service.js';

/** Longest `Idempotency-Key` accepted (a UUID needs 36). */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /**
   * Creates a workspace for the signed-in, verified user (no workspace needed): 201 with it, or
   * 200 with the same workspace for a retry with the same `Idempotency-Key`. The caller becomes its
   * admin and it becomes the session's active workspace. 401 `UNAUTHENTICATED` (global access
   * guard), 403 `EMAIL_NOT_VERIFIED`, 400 `IDEMPOTENCY_KEY_REQUIRED` or `VALIDATION_FAILED`.
   */
  @Post()
  @SessionOnly()
  async create(
    @Actor() actor: Caller,
    @Res({ passthrough: true }) res: Response,
    @Headers(IDEMPOTENCY_KEY_HEADER.toLowerCase()) idempotencyKeyHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<Workspace> {
    if (!actor.user.emailVerified) {
      throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' });
    }

    const idempotencyKey = idempotencyKeyHeader?.trim() ?? '';
    if (idempotencyKey === '') {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: `${IDEMPOTENCY_KEY_HEADER} header required`,
      });
    }
    if (idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw validationFailed(`${IDEMPOTENCY_KEY_HEADER} too long`);
    }
    const parsed = createWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) throw validationFailed('Invalid workspace name');

    const { workspace, created } = await this.workspaces.create({
      userId: actor.user.id,
      sessionToken: actor.sessionToken,
      name: parsed.data.name,
      idempotencyKey,
    });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return workspace;
  }

  /**
   * The signed-in user's workspaces (active memberships only, sorted by name) and the session's
   * active one, `null` when it is no longer an active membership. 401 `UNAUTHENTICATED` (global
   * access guard).
   */
  @Get()
  @SessionOnly()
  list(@Actor() actor: Caller): Promise<WorkspaceList> {
    return this.workspaces.list(actor.user.id, actor.workspaceId);
  }

  /**
   * Makes a workspace the user is an active member of the session's active workspace and returns
   * it. Unknown ids, other people's workspaces and deactivated memberships all get the same 404
   * `WORKSPACE_UNAVAILABLE` (decisions §3). 400 `VALIDATION_FAILED`, 401 `UNAUTHENTICATED` (global
   * access guard).
   */
  @Put('active')
  @SessionOnly()
  async switchActive(@Actor() actor: Caller, @Body() body: unknown): Promise<Workspace> {
    const parsed = switchWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) throw validationFailed('Invalid workspace id');

    const workspace = await this.workspaces.switchActive(
      actor.user.id,
      actor.sessionToken,
      parsed.data.workspaceId,
    );
    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_UNAVAILABLE',
        message: 'Workspace unavailable',
      });
    }
    return workspace;
  }
}

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
