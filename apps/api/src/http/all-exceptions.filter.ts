import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  type LoggerService,
} from '@nestjs/common';
import type { Response } from 'express';

/** Body of every error response. `code` is stable and translated by the web app; `message` is for developers. */
export interface ErrorBody {
  code: string;
  message: string;
}

export const INTERNAL_ERROR: ErrorBody = {
  code: 'INTERNAL_ERROR',
  message: 'Internal server error',
};

/**
 * Turns every exception into `{ code, message }`.
 * - An `HttpException` keeps its status; its `code` is the one it carries
 *   (`new ForbiddenException({ code: 'WORKSPACE_ACCESS_REVOKED' })`) or the status name (`NOT_FOUND`).
 * - Anything else is a 500 `INTERNAL_ERROR`; details and stack go to the log, never to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toErrorResponse(exception);

    if (status >= 500) {
      this.logger.error(exception, 'ExceptionsFilter');
    }
    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  private toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (!(exception instanceof HttpException)) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: INTERNAL_ERROR };
    }
    const status = exception.getStatus();
    if (status >= 500) {
      return { status, body: { ...INTERNAL_ERROR, code: codeFromStatus(status) } };
    }
    const payload = exception.getResponse();
    const carried = typeof payload === 'object' && payload !== null ? payload : {};
    const code =
      'code' in carried && typeof carried.code === 'string' ? carried.code : codeFromStatus(status);
    const message =
      'message' in carried && typeof carried.message === 'string'
        ? carried.message
        : exception.message;
    return { status, body: { code, message } };
  }
}

/** `404` → `NOT_FOUND`, using Nest's `HttpStatus` names. */
function codeFromStatus(status: number): string {
  const name: unknown = (HttpStatus as Record<number, unknown>)[status];
  if (typeof name === 'string') {
    return name === 'INTERNAL_SERVER_ERROR' ? INTERNAL_ERROR.code : name;
  }
  return status >= 500 ? INTERNAL_ERROR.code : 'HTTP_ERROR';
}
