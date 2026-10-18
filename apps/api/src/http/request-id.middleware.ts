import { randomUUID } from 'node:crypto';
import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestId } from './request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Ids from a proxy are reused only when they are short and safe to echo in a header and a log line. */
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Express middleware: gives every request an id (reusing a well-formed `x-request-id`), returns it
 * in the response header, makes it available to loggers for the rest of the request, and writes one
 * log record when the response is finished.
 */
export function requestIdMiddleware(logger: LoggerService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && ACCEPTED_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const startedAt = process.hrtime.bigint();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.log(
        'request completed',
        {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
        },
        'HTTP',
      );
    });

    runWithRequestId(requestId, next);
  };
}
