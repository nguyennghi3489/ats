import type { z } from 'zod';

/** Emails go out in the recipient's language; invites in the inviter's (decisions §12). */
export const EMAIL_LOCALES = ['vi', 'en'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/** What the worker sends: subject plus the HTML and plain-text parts of the same message. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** One language of a template. `data` has already passed the template's schema. */
export interface EmailRenderers<Data> {
  subject(data: Data): string;
  html(data: Data): string;
  text(data: Data): string;
}

/**
 * A template: the schema its data must match (checked when enqueuing and again when sending)
 * and renderers for every locale.
 */
export type EmailTemplate<Schema extends z.ZodType = z.ZodType> = {
  readonly data: Schema;
} & { readonly [Locale in EmailLocale]: EmailRenderers<z.output<Schema>> };

/** Declares a template with its data type inferred from the schema. */
export function defineEmailTemplate<Schema extends z.ZodType>(
  template: EmailTemplate<Schema>,
): EmailTemplate<Schema> {
  return template;
}
