import { DEFAULT_LOCALE, type MeResponse } from '@ats/shared';
import { Controller, Get, Inject, Req, Res, UnauthorizedException } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import type { Auth } from './auth.js';
import { AUTH } from './auth.tokens.js';

@Controller('api/me')
export class MeController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  /**
   * The signed-in user, or 401 `UNAUTHENTICATED`. The session is read from Postgres on every call;
   * using it more than a day after the last extension pushes its expiry 30 days out again, and the
   * refreshed cookie is passed on to the browser.
   */
  @Get()
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<MeResponse> {
    const { headers, response: session } = await this.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) {
      res.append('set-cookie', cookies);
    }
    if (!session) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not signed in' });
    }
    const { id, name, email, locale, emailVerified } = session.user;
    // The column is NOT NULL with a default; Better Auth types optional fields as nullable.
    return { user: { id, name, email, locale: locale ?? DEFAULT_LOCALE, emailVerified } };
  }
}
