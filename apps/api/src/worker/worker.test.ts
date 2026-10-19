import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Job, Queue, QueueEvents } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL_QUEUE } from '../queue/email.queue.js';
import { PING_QUEUE, type PingJobData } from '../queue/ping.queue.js';
import { stepBackoff } from '../queue/queue-definition.js';
import { QueueModule } from '../queue/queue.module.js';
import { createWorker } from './worker.js';
import type { WorkerConfig } from './worker-config.js';

// Integration tests against the Compose Redis (`docker compose up -d --wait redis`).
// Each test uses its own key prefix so runs never see each other's jobs.
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const config: WorkerConfig = {
  nodeEnv: 'test',
  logLevel: 'log',
  redisUrl,
  // Compose Mailpit; no test here sends email, the worker only needs the settings to start.
  smtp: { host: '127.0.0.1', port: 1025, secure: false, from: 'ATS <no-reply@example.test>' },
};

interface LogRecord {
  level: string;
  message: unknown;
  params: unknown[];
}

/** Keeps every record so tests can assert on what the worker logged. */
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

/** A producer-only context: what the HTTP API imports to enqueue jobs. */
async function createProducer(prefix: string): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [QueueModule.forRoot({ redisUrl, prefix }), QueueModule.register(PING_QUEUE)],
  }).compile();
  moduleRef.enableShutdownHooks();
  return moduleRef.init();
}

describe('worker mode', () => {
  let prefix: string;
  let logger: RecordingLogger;
  let producer: TestingModule;
  let queue: Queue<PingJobData>;
  let events: QueueEvents;
  let worker: INestApplicationContext | undefined;

  beforeEach(async () => {
    prefix = `ats-test-${randomUUID()}`;
    logger = new RecordingLogger();
    producer = await createProducer(prefix);
    queue = producer.get<Queue<PingJobData>>(getQueueToken(PING_QUEUE.name));
    events = new QueueEvents(PING_QUEUE.name, { connection: { url: redisUrl }, prefix });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.obliterate({ force: true });
    await events.close();
    await producer.close();
  });

  async function startWorker(): Promise<INestApplicationContext> {
    worker = await createWorker(config, logger, { queuePrefix: prefix });
    return worker;
  }

  it('processes a ping job enqueued by a producer and logs its id', async () => {
    await startWorker();

    const job = await queue.add('ping', {});
    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({ pong: true });

    expect(logger.find('ping processed')).toContainEqual(
      expect.objectContaining({ params: [{ jobId: job.id, attempt: 1 }, 'PingProcessor'] }),
    );
  });

  it('logs that it is connected to Redis without opening an HTTP server', async () => {
    const app = await startWorker();

    expect('listen' in app).toBe(false);
    await expect.poll(() => logger.find('worker ready').length).toBe(2);
    expect(logger.find('worker ready').map((record) => record.params[0])).toEqual(
      expect.arrayContaining([{ queue: PING_QUEUE.name }, { queue: EMAIL_QUEUE.name }]),
    );
  });

  it('retries a throwing job with the queue default attempts', async () => {
    await startWorker();

    const job = await queue.add(
      'ping',
      { failAttempts: 1 },
      { backoff: { type: 'fixed', delay: 50 } },
    );
    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({ pong: true });

    const failed = logger.find('job failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.level).toBe('warn');
    expect(failed[0]?.params[0]).toMatchObject({
      queue: PING_QUEUE.name,
      jobId: job.id,
      attempt: 1,
      attempts: PING_QUEUE.attempts,
      willRetry: true,
      retryInMs: 50,
      error: 'PING_FAILED_ON_PURPOSE',
    });
  });

  it('honours per-job attempts and a custom step backoff, then gives up', async () => {
    await startWorker();

    const startedAt = Date.now();
    const job = await queue.add(
      'ping',
      { failAttempts: 10 },
      { attempts: 3, backoff: stepBackoff([100, 300]) },
    );
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('PING_FAILED_ON_PURPOSE');

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(400);
    // The queue event can arrive before the worker's own `failed` handler has logged.
    await expect.poll(() => logger.find('job failed').length).toBe(3);
    const failed = logger.find('job failed').map((record) => record.params[0]);
    expect(failed).toEqual([
      expect.objectContaining({ attempt: 1, attempts: 3, willRetry: true, retryInMs: 100 }),
      expect.objectContaining({ attempt: 2, attempts: 3, willRetry: true, retryInMs: 300 }),
      expect.objectContaining({ attempt: 3, attempts: 3, willRetry: false }),
    ]);
    expect(logger.find('job failed').at(-1)?.level).toBe('error');
    const stored = (await queue.getJob(job.id ?? '')) as Job | undefined;
    expect(stored?.attemptsMade).toBe(3);
    expect(await stored?.getState()).toBe('failed');
  });

  it('lets the active job finish before shutting down', async () => {
    const app = await startWorker();

    const job = await queue.add('ping', { durationMs: 700 });
    await expect.poll(async () => job.getState(), { timeout: 5_000 }).toBe('active');

    await app.close();
    worker = undefined;

    expect(await job.getState()).toBe('completed');
    expect(logger.find('ping processed')).toHaveLength(1);
  });

  it('does not process jobs in a producer-only context', async () => {
    const job = await queue.add('ping', {});

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await job.getState()).toBe('waiting');
  });
});
