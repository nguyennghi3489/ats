import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { LoggedWorkerHost } from '../queue/logged-worker-host.js';
import { PING_QUEUE, type PingJobData, type PingResult } from '../queue/ping.queue.js';
import { workerOptions } from '../queue/queue-definition.js';

@Processor(PING_QUEUE.name, workerOptions())
export class PingProcessor extends LoggedWorkerHost {
  async process(job: Job<PingJobData>): Promise<PingResult> {
    const attempt = job.attemptsMade + 1;
    if (job.data.durationMs !== undefined && job.data.durationMs > 0) {
      const durationMs = job.data.durationMs;
      await new Promise((resolve) => setTimeout(resolve, durationMs));
    }
    if (attempt <= (job.data.failAttempts ?? 0)) {
      throw new Error('PING_FAILED_ON_PURPOSE');
    }
    this.logger.log('ping processed', { jobId: job.id, attempt });
    return { pong: true };
  }
}
