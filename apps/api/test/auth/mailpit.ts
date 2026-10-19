import type { LoggerService } from '@nestjs/common';
import { expect } from 'vitest';
import type { SmtpConfig } from '../../src/config/config.js';

// Helpers for tests that read the mail the worker delivered to the Compose Mailpit
// (`docker compose up -d --wait mailpit`).
const mailpitUrl = (process.env.MAILPIT_URL || 'http://127.0.0.1:8025').replace(/\/$/, '');

/** Mailpit's SMTP side, as the worker sends to it. */
export const mailpitSmtp: SmtpConfig = {
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false,
  from: 'ATS <no-reply@example.test>',
};

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  HTML: string;
  Text: string;
}

function toQuery(address: string): string {
  return new URLSearchParams({ query: `to:"${address}"` }).toString();
}

/** Every message Mailpit holds for `address`, oldest first. */
export async function messagesTo(address: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpitUrl}/api/v1/search?${toQuery(address)}`);
  const search = (await response.json()) as { messages: { ID: string; Created: string }[] };
  // The search lists newest first, with the receive time the message details lack.
  const summaries = [...search.messages].sort(
    (a, b) => Date.parse(a.Created) - Date.parse(b.Created),
  );
  return Promise.all(
    summaries.map(
      async ({ ID }) =>
        (await (await fetch(`${mailpitUrl}/api/v1/message/${ID}`)).json()) as MailpitMessage,
    ),
  );
}

/** Waits until Mailpit holds exactly `count` messages for `address`, then returns them. */
export async function waitForMessages(address: string, count: number): Promise<MailpitMessage[]> {
  await expect
    .poll(async () => (await messagesTo(address)).length, { timeout: 10_000, interval: 100 })
    .toBe(count);
  return messagesTo(address);
}

/** Removes the messages for `address` left by earlier runs. */
export async function deleteMessagesTo(address: string): Promise<void> {
  await fetch(`${mailpitUrl}/api/v1/search?${toQuery(address)}`, { method: 'DELETE' });
}

/** The verification link in a message: path and query of the API verify endpoint. */
export function verificationPath(message: MailpitMessage | undefined): string {
  const match = /https?:\/\/\S+?(\/api\/auth\/verify-email\?\S+)/.exec(message?.Text ?? '');
  expect(match, 'verification link in the email').not.toBeNull();
  return match?.[1] ?? '';
}

export interface LogRecord {
  level: string;
  message: unknown;
  params: unknown[];
}

/** Keeps every record at every level, so tests can check what would reach the logs. */
export class RecordingLogger implements LoggerService {
  readonly records: LogRecord[] = [];

  log(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'log', message, params });
  }
  error(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'error', message, params });
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'warn', message, params });
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'debug', message, params });
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'verbose', message, params });
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.records.push({ level: 'fatal', message, params });
  }
}
