import type { z } from 'zod';
import { EmailError, failedFields } from '../email-error.js';
import { testTemplate } from './test.template.js';
import type { EmailLocale, EmailTemplate, RenderedEmail } from './types.js';
import { verifyEmailTemplate } from './verify-email.template.js';

/**
 * Every email the API can send, by name. The name travels in the job, so renaming a template
 * strands jobs still in the queue: add the new name, remove the old one a release later.
 */
export const EMAIL_TEMPLATES = {
  test: testTemplate,
  'verify-email': verifyEmailTemplate,
} as const satisfies Record<string, EmailTemplate>;

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES;

/** The data a template needs, as the caller passes it (before the schema's transforms). */
export type EmailTemplateData<Name extends EmailTemplateName> = z.input<
  (typeof EMAIL_TEMPLATES)[Name]['data']
>;

export function isEmailTemplateName(name: string): name is EmailTemplateName {
  return Object.hasOwn(EMAIL_TEMPLATES, name);
}

/** Checks `data` against the template's schema; throws `EMAIL_INVALID_DATA` naming the fields. */
export function parseTemplateData(name: EmailTemplateName, data: unknown): unknown {
  const result = EMAIL_TEMPLATES[name].data.safeParse(data);
  if (!result.success) throw new EmailError('EMAIL_INVALID_DATA', failedFields(result.error));
  return result.data;
}

/** Renders one email in the given language. Validates the data first. */
export function renderEmail(name: string, locale: EmailLocale, data: unknown): RenderedEmail {
  if (!isEmailTemplateName(name)) throw new EmailError('EMAIL_UNKNOWN_TEMPLATE');
  const parsed = parseTemplateData(name, data);
  // The registry is keyed by name, so `parsed` matches this template's renderers.
  const renderers = EMAIL_TEMPLATES[name][locale] as EmailTemplate['en'];
  return {
    subject: renderers.subject(parsed).replace(/[\r\n]+/g, ' '),
    html: renderers.html(parsed),
    text: renderers.text(parsed),
  };
}
