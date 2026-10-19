import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Logger, type LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Job, type Queue, QueueEvents, UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { SmtpConfig } from '../config/config.js';
import { EmailModule } from '../email/email.module.js';
import { EmailService } from '../email/email.service.js';
import type { EmailTransport, OutgoingEmail } from '../email/email-transport.js';
import { EMAIL_QUEUE, type EmailJobData, type EmailJobResult } from '../queue/email.queue.js';
import { QueueModule } from '../queue/queue.module.js';
import { EmailProcessor } from './email.processor.js';
import { createWorker } from './worker.js';
import type { WorkerConfig } from './worker-config.js';

const testData = { name: 'Someone', url: 'https://ats.example.test/start' };

function emailJob(data: unknown, attemptsMade = 0): Job<EmailJobData, EmailJobResult> {
  return {
    id: '7',
    name: 'test',
    data,
    attemptsMade,
    opts: { attempts: 5 },
  } as Job<EmailJobData, EmailJobResult>;
}

class FakeTransport implements EmailTransport {
  readonly sent: OutgoingEmail[] = [];
  failWith: unknown;

  async sendMail(email: OutgoingEmail): Promise<{ messageId: string }> {
    if (this.failWith !== undefined) throw this.failWith;
    this.sent.push(email);
    return { messageId: '<fake@example.test>' };
  }
}

describe('EmailProcessor', () => {
  let log: MockInstance<Logger['log']>;
  let transport: FakeTransport;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    transport = new FakeTransport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the template in the job locale and sends it', async () => {
    const result = await new EmailProcessor(transport).process(
      emailJob({ to: 'someone@example.test', locale: 'vi', template: 'test', data: testData }),
    );

    expect(result).toEqual({ messageId: '<fake@example.test>' });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: 'someone@example.test',
      subject: 'Email thử nghiệm từ ATS',
    });
    expect(transport.sent[0]?.html).toContain('Xin chào Someone,');
    expect(transport.sent[0]?.text).toContain('Xin chào Someone,');
  });

  it('logs the job id, template and outcome but not the recipient or the body', async () => {
    await new EmailProcessor(transport).process(
      emailJob({ to: 'private@example.test', locale: 'en', template: 'test', data: testData }),
    );

    expect(log).toHaveBeenCalledWith('email sent', {
      jobId: '7',
      template: 'test',
      locale: 'en',
      attempt: 1,
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('private@example.test');
    expect(logged).not.toContain('Hello Someone');
  });

  it('fails the attempt with the SMTP error code only, so BullMQ retries it', async () => {
    transport.failWith = Object.assign(
      new Error("Can't send mail - all recipients were rejected: 550 <private@example.test>"),
      { code: 'EENVELOPE', responseCode: 550 },
    );

    const failure = new EmailProcessor(transport).process(
      emailJob({ to: 'private@example.test', locale: 'en', template: 'test', data: testData }),
    );

    await expect(failure).rejects.toThrow('EMAIL_SEND_FAILED: EENVELOPE 550');
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('gives up at once on a job it cannot render', async () => {
    const failure = new EmailProcessor(transport).process(
      emailJob({ to: 'private@example.test', locale: 'en', template: 'gone', data: {} }),
    );

    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failure).rejects.toThrow('EMAIL_UNKNOWN_TEMPLATE');
    expect(transport.sent).toHaveLength(0);
  });
});

// The worker end to end against the Compose Redis and Mailpit
// (`docker compose up -d --wait redis mailpit`). Each test uses its own key prefix.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const mailpitUrl = (process.env.MAILPIT_URL || 'http://127.0.0.1:8025').replace(/\/$/, '');
const mailpitSmtp: SmtpConfig = {
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false,
  from: 'ATS <no-reply@example.test>',
};

interface LogRecord {
  level: string;
  message: unknown;
  params: unknown[];
}

class RecordingLogger implements LoggerService {
  readonly records: LogRecord[] = [];
  log(message: unknown, ...params: unknown[]) {
    this.records.push({ level: 'log', message, params });
  }
  error(message: unknown, ...params: unknown[]) {
    this.records.push({ level: 'error', message, params });
  }
  warn(message: unknown, ...params: unknown[]) {
    this.records.push({ level: 'warn', message, params });
  }
  debug() {}
  verbose() {}

  find(message: string): LogRecord[] {
    return this.records.filter((record) => record.message === message);
  }
}

interface MailpitMessage {
  Subject: string;
  From: { Address: string };
  To: { Address: string }[];
  HTML: string;
  Text: string;
}

/** The single message Mailpit holds for `address`, waiting for the worker to deliver it. */
async function mailpitMessagesTo(address: string): Promise<MailpitMessage[]> {
  const query = new URLSearchParams({ query: `to:"${address}"` });
  const search = (await (await fetch(`${mailpitUrl}/api/v1/search?${query}`)).json()) as {
    messages: { ID: string }[];
  };
  return Promise.all(
    search.messages.map(
      async ({ ID }) =>
        (await (await fetch(`${mailpitUrl}/api/v1/message/${ID}`)).json()) as MailpitMessage,
    ),
  );
}

/** A local port nothing listens on: SMTP there is unreachable. */
function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

describe('email worker (Redis + Mailpit)', () => {
  let prefix: string;
  let logger: RecordingLogger;
  let producer: TestingModule;
  let emails: EmailService;
  let queue: Queue<EmailJobData, EmailJobResult>;
  let events: QueueEvents;
  let worker: INestApplicationContext | undefined;

  beforeEach(async () => {
    prefix = `ats-test-${randomUUID()}`;
    logger = new RecordingLogger();
    producer = await Test.createTestingModule({
      imports: [QueueModule.forRoot({ redisUrl, prefix }), EmailModule],
    }).compile();
    await producer.init();
    emails = producer.get(EmailService);
    queue = producer.get(getQueueToken(EMAIL_QUEUE.name));
    events = new QueueEvents(EMAIL_QUEUE.name, { connection: { url: redisUrl }, prefix });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.obliterate({ force: true });
    await events.close();
    await producer.close();
  });

  async function startWorker(smtp: SmtpConfig): Promise<void> {
    const config: WorkerConfig = { nodeEnv: 'test', logLevel: 'log', redisUrl, smtp };
    worker = await createWorker(config, logger, { queuePrefix: prefix });
  }

  it.each([
    ['en', 'ATS test email', 'Hello Someone,'],
    ['vi', 'Email thử nghiệm từ ATS', 'Xin chào Someone,'],
  ] as const)(
    'delivers the %s test email to Mailpit with HTML and text parts',
    async (locale, subject, greeting) => {
      await startWorker(mailpitSmtp);
      const to = `someone-${randomUUID()}@example.test`;

      const { jobId } = await emails.enqueue({ to, locale, template: 'test', data: testData });
      const job = await queue.getJob(jobId);
      await job?.waitUntilFinished(events, 15_000);

      await expect.poll(async () => (await mailpitMessagesTo(to)).length).toBe(1);
      const [message] = await mailpitMessagesTo(to);
      expect(message?.Subject).toBe(subject);
      expect(message?.From.Address).toBe('no-reply@example.test');
      expect(message?.To.map((recipient) => recipient.Address)).toEqual([to]);
      expect(message?.HTML).toContain(greeting);
      expect(message?.HTML).toContain('href="https://ats.example.test/start"');
      expect(message?.Text).toContain(greeting);
      expect(message?.Text).toContain('https://ats.example.test/start');

      // Sent jobs are removed; the log names the job and template, never the address.
      expect(await queue.getJob(jobId)).toBeUndefined();
      await expect.poll(() => logger.find('email sent').length).toBe(1);
      expect(logger.find('email sent')[0]?.params[0]).toEqual({
        jobId,
        template: 'test',
        locale,
        attempt: 1,
      });
      expect(JSON.stringify(logger.records)).not.toContain(to);
    },
    20_000,
  );

  it('schedules a retry 10 s later when SMTP is unreachable', async () => {
    await startWorker({ ...mailpitSmtp, port: await closedPort() });
    const to = `unreachable-${randomUUID()}@example.test`;

    const { jobId } = await emails.enqueue({ to, locale: 'en', template: 'test', data: testData });

    await expect.poll(() => logger.find('job failed').length, { timeout: 10_000 }).toBe(1);
    expect(logger.find('job failed')[0]).toMatchObject({
      level: 'warn',
      params: [
        expect.objectContaining({
          queue: EMAIL_QUEUE.name,
          jobId,
          jobName: 'test',
          attempt: 1,
          attempts: 5,
          willRetry: true,
          retryInMs: 10_000,
          error: expect.stringMatching(/^EMAIL_SEND_FAILED: /),
        }),
        'EmailProcessor',
      ],
    });
    expect(await (await queue.getJob(jobId))?.getState()).toBe('delayed');
    expect(JSON.stringify(logger.records)).not.toContain(to);
  }, 20_000);

  it('after the last attempt keeps the job in the failed set', async () => {
    await startWorker({ ...mailpitSmtp, port: await closedPort() });
    const to = `unreachable-${randomUUID()}@example.test`;

    // Same job and attempts as `EmailService.enqueue`, with the 10 s backoff shortened for the test.
    const job = await queue.add(
      'test',
      { to, locale: 'en', template: 'test', data: testData },
      { backoff: { type: 'exponential', delay: 20 } },
    );
    await expect(job.waitUntilFinished(events, 15_000)).rejects.toThrow(/EMAIL_SEND_FAILED/);

    await expect.poll(() => logger.find('job failed').length).toBe(5);
    const failed = logger.find('job failed');
    expect(failed.map((record) => record.level)).toEqual(['warn', 'warn', 'warn', 'warn', 'error']);
    expect(failed.map((record) => (record.params[0] as { retryInMs?: number }).retryInMs)).toEqual([
      20,
      40,
      80,
      160,
      undefined,
    ]);
    const stored = await queue.getJob(job.id ?? '');
    expect(stored?.attemptsMade).toBe(5);
    expect(await stored?.getState()).toBe('failed');
    expect((await queue.getFailed()).map((failedJob) => failedJob.id)).toEqual([job.id]);
    expect(JSON.stringify(logger.records)).not.toContain(to);
  }, 20_000);
});
