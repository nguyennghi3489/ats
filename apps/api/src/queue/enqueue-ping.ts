import { parseArgs } from 'node:util';
import { Queue } from 'bullmq';
import { ConfigError } from '../config/config.js';
import { loadRedisUrl } from '../worker/worker-config.js';
import { PING_QUEUE, type PingJobData } from './ping.queue.js';
import { registerQueueOptions } from './queue-definition.js';

/**
 * Developer/QA tool: `pnpm --filter api queue:ping [--fail N] [--duration MS] [--count N]` adds
 * ping jobs with the queue's default retry policy and prints their ids. Run the worker to see them
 * processed.
 */
const usage = 'usage: queue:ping [--fail N] [--duration MS] [--count N]';

function wholeNumber(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) {
    process.stderr.write(`--${name} must be a whole number\n${usage}\n`);
    process.exit(1);
  }
  return Number(value);
}

const { values } = parseArgs({
  options: {
    fail: { type: 'string' },
    duration: { type: 'string' },
    count: { type: 'string' },
  },
});

let redisUrl: string;
try {
  redisUrl = loadRedisUrl(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const data: PingJobData = {
  failAttempts: wholeNumber('fail', values.fail, 0),
  durationMs: wholeNumber('duration', values.duration, 0),
};
const count = wholeNumber('count', values.count, 1);

const { defaultJobOptions } = registerQueueOptions(PING_QUEUE);
const queue = new Queue<PingJobData>(PING_QUEUE.name, {
  connection: { url: redisUrl },
  ...(defaultJobOptions === undefined ? {} : { defaultJobOptions }),
});
try {
  for (let index = 0; index < count; index += 1) {
    const job = await queue.add('ping', data);
    process.stdout.write(
      `${JSON.stringify({ message: 'ping enqueued', jobId: job.id, ...data })}\n`,
    );
  }
} finally {
  await queue.close();
}
