import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL_QUEUE, type EmailJobData } from '../queue/email.queue.js';
import { QueueModule } from '../queue/queue.module.js';
import { EmailModule } from './email.module.js';
import { EmailService } from './email.service.js';

// Against the Compose Redis (`docker compose up -d --wait redis`), each test with its own prefix.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

describe('EmailService', () => {
  let moduleRef: TestingModule;
  let emails: EmailService;
  let queue: Queue<EmailJobData>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [QueueModule.forRoot({ redisUrl, prefix: `ats-test-${randomUUID()}` }), EmailModule],
    }).compile();
    await moduleRef.init();
    emails = moduleRef.get(EmailService);
    queue = moduleRef.get<Queue<EmailJobData>>(getQueueToken(EMAIL_QUEUE.name));
  });

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await moduleRef.close();
  });

  it('adds a job named after the template with the email retry policy', async () => {
    const { jobId } = await emails.enqueue({
      to: 'someone@example.test',
      locale: 'en',
      template: 'test',
      data: { name: 'Someone', url: 'https://ats.example.test/' },
    });

    const job = await queue.getJob(jobId);
    expect(job?.name).toBe('test');
    expect(job?.data).toEqual({
      to: 'someone@example.test',
      locale: 'en',
      template: 'test',
      data: { name: 'Someone', url: 'https://ats.example.test/' },
    });
    expect(job?.opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  });

  it.each([
    ['a bad address', { to: 'not-an-address' }, /EMAIL_INVALID_MESSAGE: to/],
    ['an unsupported locale', { locale: 'fr' }, /EMAIL_INVALID_MESSAGE: locale/],
    ['an unknown template', { template: 'nope' }, /EMAIL_UNKNOWN_TEMPLATE/],
    ['data the template refuses', { data: { name: 'A' } }, /EMAIL_INVALID_DATA: url/],
  ])('refuses %s and adds no job', async (_case, override, error) => {
    const message = {
      to: 'someone@example.test',
      locale: 'en',
      template: 'test',
      data: { name: 'A', url: 'https://ats.example.test/' },
      ...override,
    };

    // Bypass the types on purpose: callers in plain JS or with `as` casts still get checked.
    await expect(emails.enqueue(message as never)).rejects.toThrow(error);
    expect(await queue.getJobCounts()).toMatchObject({ waiting: 0, delayed: 0 });
  });

  it('keeps the recipient address out of error messages', async () => {
    await expect(
      emails.enqueue({
        to: 'secret-person@example.test',
        locale: 'en',
        template: 'test',
        data: { name: 'A', url: 'javascript:alert(1)' },
      }),
    ).rejects.toThrow(expect.objectContaining({ message: expect.not.stringContaining('secret') }));
  });
});
