import { UNAUTHENTICATED } from '@ats/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from '../auth/auth.js';
import { AUTH } from '../auth/auth.tokens.js';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';
import { PUBLIC_ROUTE, type RequestWithActor, SESSION_ONLY_ROUTE } from './decorators.js';
import { type AccessResult, type Actor, resolveAccess } from './resolve-access.js';
import { sessionTokenFromCookies } from './session-cookie.js';

/** What a route needs: nothing (`@Public()`), a session (`@SessionOnly()`) or, by default, a workspace. */
export type RouteAccess = 'public' | 'session' | 'workspace';

/**
 * The actor a route gets for `result`, or the refusal: 401 `UNAUTHENTICATED` without a valid
 * session; on workspace routes 403 `WORKSPACE_REQUIRED` / `WORKSPACE_ACCESS_REVOKED`. A
 * `@SessionOnly()` route accepts a user without a usable workspace (`workspaceId: null`).
 */
export function actorFor(result: AccessResult, access: Exclude<RouteAccess, 'public'>): Actor {
  if (result.ok) return result.actor;
  if (result.code === UNAUTHENTICATED) {
    throw new UnauthorizedException({ code: result.code, message: 'Not signed in' });
  }
  if (access === 'session') return result.actor;
  throw new ForbiddenException({ code: result.code, message: 'No access to a workspace' });
}

/**
 * The global guard (decisions §3), registered once as `APP_GUARD`: every route needs a session and
 * an active membership of the session's active workspace unless marked `@Public()` or
 * `@SessionOnly()`. Resolves access with one query and attaches the actor to the request
 * (`@Actor()`).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private cookieName: Promise<string> | undefined;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = this.routeAccess(context);
    if (access === 'public') return true;

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const token = sessionTokenFromCookies(
      request.headers.cookie,
      await this.sessionCookieName(),
      this.config.betterAuthSecret,
    );
    const result: AccessResult = token
      ? await resolveAccess(this.database.db, token, null)
      : { ok: false, code: UNAUTHENTICATED };
    request.actor = actorFor(result, access);
    return true;
  }

  routeAccess(context: ExecutionContext): RouteAccess {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) return 'public';
    if (this.reflector.getAllAndOverride<boolean>(SESSION_ONLY_ROUTE, targets)) return 'session';
    return 'workspace';
  }

  /** Better Auth's session cookie name (`__Secure-` prefixed when cookies are secure). */
  private sessionCookieName(): Promise<string> {
    this.cookieName ??= this.auth.$context.then((ctx) => ctx.authCookies.sessionToken.name);
    return this.cookieName;
  }
}
