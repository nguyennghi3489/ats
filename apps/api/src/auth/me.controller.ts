import type { MeResponse } from '@ats/shared';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { Actor, SessionOnly } from '../access/decorators.js';
import type { Actor as Caller } from '../access/resolve-access.js';
import type { Auth } from './auth.js';
import { AUTH } from './auth.tokens.js';

@Controller('api/me')
export class MeController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  /**
   * The signed-in user, no workspace needed; without a session the global access guard answers
   * 401 `UNAUTHENTICATED`. The web app calls it on every load, so it also keeps the session alive:
   * using it more than a day after the last extension pushes its expiry 30 days out again, and the
   * refreshed cookie is passed on to the browser.
   */
  @Get()
  @SessionOnly()
  async me(
    @Actor() actor: Caller,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { headers } = await this.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) {
      res.append('set-cookie', cookies);
    }
    const { id, name, email, locale, emailVerified } = actor.user;
    return { user: { id, name, email, locale, emailVerified } };
  }
}
