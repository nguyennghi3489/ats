import { createTransport } from 'nodemailer';
import type { SmtpConfig } from '../config/config.js';
import type { RenderedEmail } from './templates/types.js';

/** Injection token for the `EmailTransport` the worker sends with. */
export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface OutgoingEmail extends RenderedEmail {
  to: string;
}

/** What the worker needs from Nodemailer; tests can pass their own. The sender is preset. */
export interface EmailTransport {
  sendMail(email: OutgoingEmail): Promise<{ messageId: string }>;
}

/**
 * Nodemailer over SMTP: Mailpit locally, Resend in production (decisions §1). One connection per
 * email, with short timeouts so an unreachable server fails the attempt and BullMQ retries it.
 */
export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  return createTransport(
    {
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.auth === undefined ? {} : { auth: config.auth }),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    },
    { from: config.from },
  );
}

/**
 * The part of a Nodemailer error that is safe to log: its code (`ECONNECTION`, `EENVELOPE`, ...)
 * and SMTP response code. The message itself can quote recipient addresses, so it is dropped.
 */
export function smtpErrorSummary(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  const parts = [
    typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code) ? code : 'UNKNOWN',
    ...(typeof responseCode === 'number' ? [String(responseCode)] : []),
  ];
  return parts.join(' ');
}
