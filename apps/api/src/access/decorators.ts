import {
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Actor as ResolvedActor } from './resolve-access.js';

/** Metadata key of `@Public()`. */
export const PUBLIC_ROUTE = 'access:public';

/** Metadata key of `@SessionOnly()`. */
export const SESSION_ONLY_ROUTE = 'access:session-only';

/**
 * The only way out of the global access guard (decisions §3): no session needed, no actor attached.
 * Only for routes that reveal nothing (health checks).
 */
export const Public = (): CustomDecorator<string> => SetMetadata(PUBLIC_ROUTE, true);

/**
 * Not an opt-out: the guard still runs and still requires a session, but not a workspace. For the
 * routes a signed-in user needs before having or choosing one (`/api/me`, workspace list, create,
 * switch). The actor is a `WorkspaceActor` when the active workspace is usable, else a
 * `SessionActor` (`workspaceId: null`).
 */
export const SessionOnly = (): CustomDecorator<string> => SetMetadata(SESSION_ONLY_ROUTE, true);

/** A request that went through the access guard. */
export interface RequestWithActor extends Request {
  actor?: ResolvedActor;
}

/**
 * The caller the access guard attached: a `WorkspaceActor` on ordinary routes, an `Actor` on
 * `@SessionOnly()` ones. Never use it on `@Public()` routes (there is none).
 */
export const Actor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const actor = context.switchToHttp().getRequest<RequestWithActor>().actor;
  if (!actor) throw new Error('@Actor() used on a route the access guard did not resolve');
  return actor;
});
