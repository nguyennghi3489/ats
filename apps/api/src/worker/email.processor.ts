import { Processor } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { EmailError } from '../email/email-error.js';
import { parseEmailMessage } from '../email/email-message.js';
import {
  EMAIL_TRANSPORT,
  type EmailTransport,
  smtpErrorSummary,
} from '../email/email-transport.js';
import { renderEmail } from '../email/templates/registry.js';
import type { RenderedEmail } from '../email/templates/types.js';
import { EMAIL_QUEUE, type EmailJobData, type EmailJobResult } from '../queue/email.queue.js';
import { LoggedWorkerHost } from '../queue/logged-worker-host.js';
import { workerOptions } from '../queue/queue-definition.js';

/**
 * Renders an `email` job in the recipient's language and sends it over SMTP. A send failure
 * fails the attempt (BullMQ retries with the queue's backoff); a job that cannot be rendered
 * fails for good. Logs name the job, template and outcome, never the address or the body.
 */
@Processor(EMAIL_QUEUE.name, workerOptions())
export class EmailProcessor extends LoggedWorkerHost {
  constructor(@Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport) {
    super();
  }

  async process(job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> {
    let message: EmailJobData;
    let email: RenderedEmail;
    try {
      message = parseEmailMessage(job.data);
      email = renderEmail(message.template, message.locale, message.data);
    } catch (error) {
      // Retrying cannot fix bad data or a template removed since the job was added.
      throw new UnrecoverableError(
        error instanceof Error ? error.message : 'EMAIL_INVALID_MESSAGE',
      );
    }

    let messageId: string;
    try {
      ({ messageId } = await this.transport.sendMail({ to: message.to, ...email }));
    } catch (error) {
      throw new EmailError('EMAIL_SEND_FAILED', smtpErrorSummary(error));
    }

    this.logger.log('email sent', {
      jobId: job.id,
      template: message.template,
      locale: message.locale,
      attempt: job.attemptsMade + 1,
    });
    return { messageId };
  }
}
