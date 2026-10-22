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
  Inject,
  NotFoundException,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import type { Auth } from '../auth/auth.js';
import { AUTH } from '../auth/auth.tokens.js';
import { WorkspacesService } from './workspaces.service.js';

/** Longest `Idempotency-Key` accepted (a UUID needs 36). */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly workspaces: WorkspacesService,
  ) {}

  /**
   * Creates a workspace for the signed-in, verified user (no workspace needed): 201 with it, or
   * 200 with the same workspace for a retry with the same `Idempotency-Key`. The caller becomes its
   * admin and it becomes the session's active workspace. 401 `UNAUTHENTICATED`, 403
   * `EMAIL_NOT_VERIFIED`, 400 `IDEMPOTENCY_KEY_REQUIRED` or `VALIDATION_FAILED`.
   */
  @Post()
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers(IDEMPOTENCY_KEY_HEADER.toLowerCase()) idempotencyKeyHeader: string | undefined,
    @Body() body: unknown,
  ): Promise<Workspace> {
    const session = await this.session(req, res);
    if (!session.user.emailVerified) {
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
      userId: session.user.id,
      sessionToken: session.session.token,
      name: parsed.data.name,
      idempotencyKey,
    });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return workspace;
  }

  /**
   * The signed-in user's workspaces (active memberships only, sorted by name) and the session's
   * active one, `null` when it is no longer an active membership. 401 `UNAUTHENTICATED`.
   */
  @Get()
  async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkspaceList> {
    const session = await this.session(req, res);
    return this.workspaces.list(session.user.id, session.session.activeOrganizationId);
  }

  /**
   * Makes a workspace the user is an active member of the session's active workspace and returns
   * it. Unknown ids, other people's workspaces and deactivated memberships all get the same 404
   * `WORKSPACE_UNAVAILABLE` (decisions §3). 400 `VALIDATION_FAILED`, 401 `UNAUTHENTICATED`.
   */
  @Put('active')
  async switchActive(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<Workspace> {
    const session = await this.session(req, res);
    const parsed = switchWorkspaceRequestSchema.safeParse(body);
    if (!parsed.success) throw validationFailed('Invalid workspace id');

    const workspace = await this.workspaces.switchActive(
      session.user.id,
      session.session.token,
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

  /**
   * The caller's Better Auth session, passing on any cookie it refreshes. 401 `UNAUTHENTICATED`
   * without one (until the global guard of decisions §3 does this).
   */
  private async session(req: Request, res: Response) {
    const { headers, response: session } = await this.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) res.append('set-cookie', cookies);
    if (!session) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
    }
    return session;
  }
}

function validationFailed(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
