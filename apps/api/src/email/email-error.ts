import type { z } from 'zod';

export type EmailErrorCode =
  'EMAIL_INVALID_MESSAGE' | 'EMAIL_UNKNOWN_TEMPLATE' | 'EMAIL_INVALID_DATA' | 'EMAIL_SEND_FAILED';

/**
 * Error with a code. The message is `CODE` or `CODE: detail`, where the detail names fields or
 * SMTP error codes only: never addresses or data, because messages end up in logs and Redis.
 */
export class EmailError extends Error {
  override readonly name = 'EmailError';

  constructor(
    readonly code: EmailErrorCode,
    detail?: string,
  ) {
    super(detail === undefined || detail === '' ? code : `${code}: ${detail}`);
  }
}

/** `to, data.url`: the paths of the failing fields, without their values. */
export function failedFields(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.path.join('.') || '(root)'))].join(', ');
}
