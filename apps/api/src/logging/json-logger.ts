import { ConsoleLogger, type ConsoleLoggerOptions, type LogLevel } from '@nestjs/common';
import { LOG_LEVELS, type AppLogLevel } from '../config/config.js';
import { currentRequestId } from '../http/request-context.js';

/** `LOG_LEVEL=warn` enables warn, error and fatal. */
export function logLevelsFrom(minimum: AppLogLevel): LogLevel[] {
  return LOG_LEVELS.slice(LOG_LEVELS.indexOf(minimum));
}

/** Shapes of `ConsoleLogger.getJsonLogObject` (protected, so not reachable through indexed types). */
interface JsonLogOptions {
  context: string;
  logLevel: LogLevel;
  writeStreamType?: 'stdout' | 'stderr';
  errorStack?: unknown;
  params?: Record<string, unknown>;
  error?: Error;
}

interface JsonLogObject {
  [key: string]: unknown;
  level: LogLevel;
  pid: number;
  timestamp: number;
  message: unknown;
}

/**
 * Nest's console logger in JSON mode: one object per line on stdout/stderr (read by Docker logs),
 * structured params at the top level, and the current request id on every record logged during a
 * request.
 */
export class JsonLogger extends ConsoleLogger {
  constructor(options: Omit<ConsoleLoggerOptions, 'json' | 'colors' | 'flattenParams'> = {}) {
    super({ ...options, json: true, colors: false, flattenParams: true });
  }

  protected override getJsonLogObject(message: unknown, options: JsonLogOptions): JsonLogObject {
    const record = super.getJsonLogObject(message, options);
    const requestId = currentRequestId();
    if (requestId !== undefined && record.requestId === undefined) {
      record.requestId = requestId;
    }
    return record;
  }
}
