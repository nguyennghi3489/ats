import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EMAIL_QUEUE, type EmailJobData, type EmailJobResult } from '../queue/email.queue.js';
import { type EmailMessage, parseEmailMessage } from './email-message.js';

/**
 * Sends transactional email through the `email` queue: the worker renders the template in the
 * recipient's language and delivers it over SMTP, retrying with backoff (decisions §1).
 */
@Injectable()
export class EmailService {
  constructor(
    @InjectQueue(EMAIL_QUEUE.name)
    private readonly queue: Queue<EmailJobData, EmailJobResult>,
  ) {}

  /**
   * Validates the message and adds it to the queue; resolves once the job is stored, not sent.
   * Throws `EmailError` (`EMAIL_INVALID_MESSAGE`, `EMAIL_UNKNOWN_TEMPLATE`, `EMAIL_INVALID_DATA`).
   */
  async enqueue(message: EmailMessage): Promise<{ jobId: string }> {
    const job = parseEmailMessage(message);
    const added = await this.queue.add(job.template, job);
    return { jobId: added.id ?? '' };
  }
}
