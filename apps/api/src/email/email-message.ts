import { z } from 'zod';
import type { EmailJobData } from '../queue/email.queue.js';
import { EmailError, failedFields } from './email-error.js';
import {
  type EmailTemplateData,
  type EmailTemplateName,
  isEmailTemplateName,
  parseTemplateData,
} from './templates/registry.js';
import { EMAIL_LOCALES, type EmailLocale } from './templates/types.js';

/** One email to send: who, in which language, which template and the data it needs. */
export type EmailMessage = {
  [Name in EmailTemplateName]: {
    to: string;
    locale: EmailLocale;
    template: Name;
    data: EmailTemplateData<Name>;
  };
}[EmailTemplateName];

const envelope = z.object({
  to: z.email(),
  locale: z.enum(EMAIL_LOCALES),
  template: z.string(),
  data: z.unknown(),
});

/**
 * Validates a message (when enqueuing, and again in the worker for jobs written by an older
 * release). Throws `EmailError`; its message names fields, never their values.
 */
export function parseEmailMessage(input: unknown): EmailJobData {
  const result = envelope.safeParse(input);
  if (!result.success) throw new EmailError('EMAIL_INVALID_MESSAGE', failedFields(result.error));
  const { to, locale, template, data } = result.data;
  if (!isEmailTemplateName(template)) throw new EmailError('EMAIL_UNKNOWN_TEMPLATE');
  return { to, locale, template, data: parseTemplateData(template, data) };
}
