import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

/**
 * Base class for every processor. Writes one log record when the worker is connected, one per
 * failed attempt (warn while a retry is scheduled, error when the job gives up) and Redis
 * connection errors, which would otherwise crash the process as an unhandled `error` event.
 */
export abstract class LoggedWorkerHost extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  @OnWorkerEvent('ready')
  protected onReady(): void {
    this.logger.log('worker ready', { queue: this.worker.name });
  }

  @OnWorkerEvent('failed')
  protected onFailed(job: Job | undefined, error: Error): void {
    if (job === undefined) {
      this.logger.error('job failed', { queue: this.worker.name, error: error.message });
      return;
    }
    // BullMQ has already counted this attempt and, when retrying, set `delay` to the wait.
    const attempts = job.opts.attempts ?? 1;
    const willRetry = job.attemptsMade < attempts && error.name !== 'UnrecoverableError';
    const record = {
      queue: this.worker.name,
      jobId: job.id,
      jobName: job.name,
      attempt: job.attemptsMade,
      attempts,
      willRetry,
      ...(willRetry ? { retryInMs: job.delay } : {}),
      error: error.message,
    };
    if (willRetry) {
      this.logger.warn('job failed', record);
    } else {
      this.logger.error('job failed', record);
    }
  }

  @OnWorkerEvent('closed')
  protected onClosed(): void {
    this.logger.log('worker stopped', { queue: this.worker.name });
  }

  @OnWorkerEvent('error')
  protected onError(error: Error): void {
    this.logger.error('worker error', { queue: this.worker.name, error: error.message });
  }
}
