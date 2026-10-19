import { Module } from '@nestjs/common';
import { EMAIL_QUEUE } from '../queue/email.queue.js';
import { QueueModule } from '../queue/queue.module.js';
import { EmailService } from './email.service.js';

/**
 * Import in any module that sends email, then inject `EmailService`. Needs
 * `QueueModule.forRoot({ redisUrl })` at the root. Only enqueues: sending is the worker's job.
 */
@Module({
  imports: [QueueModule.register(EMAIL_QUEUE)],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
