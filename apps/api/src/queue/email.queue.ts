import type { EmailTemplateName } from '../email/templates/registry.js';
import type { EmailLocale } from '../email/templates/types.js';
import { defineQueue } from './queue-definition.js';

/**
 * Transactional email (decisions §1): `EmailService.enqueue` adds, the worker's `EmailProcessor`
 * renders and sends. 5 attempts 10 s, 20 s, 40 s, 80 s apart. A sent job is removed (it holds the
 * recipient address); a job that gave up stays in the failed set for inspection and retry.
 */
export const EMAIL_QUEUE = defineQueue('email', {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: false,
});

/** The job data, already validated. The job name is the template name. */
export interface EmailJobData {
  to: string;
  locale: EmailLocale;
  template: EmailTemplateName;
  data: unknown;
}

export interface EmailJobResult {
  /** SMTP Message-ID assigned to the sent email. */
  messageId: string;
}
