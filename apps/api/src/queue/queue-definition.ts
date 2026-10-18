import type { Processor, RegisterQueueOptions } from '@nestjs/bullmq';
import type { BackoffOptions, BackoffStrategy } from 'bullmq';

/** Worker options accepted by `@Processor(name, options)` (the type itself is not exported). */
export type NestWorkerOptions = NonNullable<Parameters<typeof Processor>[1]>;

/** Attempts in total (first run included) when a queue does not choose its own. */
export const DEFAULT_ATTEMPTS = 3;
/** 1 s, 2 s, 4 s, ... between attempts when a queue does not choose its own. */
export const DEFAULT_BACKOFF: BackoffOptions = { type: 'exponential', delay: 1_000 };

/** Completed and failed jobs kept in Redis for inspection; older ones are removed. */
const KEEP_COMPLETED = 1_000;
const KEEP_FAILED = 5_000;

const STEPS_PREFIX = 'steps:';

/**
 * One queue: its name and the retry policy every job gets unless the producer overrides it with
 * `queue.add(name, data, { attempts, backoff })`.
 */
export interface QueueDefinition {
  readonly name: string;
  readonly attempts: number;
  readonly backoff: BackoffOptions;
}

export function defineQueue(
  name: string,
  options: { attempts?: number; backoff?: BackoffOptions } = {},
): QueueDefinition {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error(`Queue ${name}: attempts must be a whole number of at least 1`);
  }
  return { name, attempts, backoff: options.backoff ?? DEFAULT_BACKOFF };
}

/**
 * A backoff with an explicit delay before each retry, e.g. `stepBackoff([10_000, 30_000, 90_000])`
 * for the CV pipeline (decisions §8). When attempts outnumber the list, the last delay repeats.
 * The delays travel inside the backoff type, so the job carries its own schedule.
 */
export function stepBackoff(delaysMs: readonly number[]): BackoffOptions {
  if (delaysMs.length === 0 || delaysMs.some((delay) => !Number.isInteger(delay) || delay < 0)) {
    throw new Error('stepBackoff needs at least one delay, each a whole number of milliseconds');
  }
  return { type: `${STEPS_PREFIX}${delaysMs.join(',')}` };
}

/** Worker-side strategy for `stepBackoff`. `attemptsMade` is 1 after the first failure. */
export const stepBackoffStrategy: BackoffStrategy = (attemptsMade, type) => {
  if (type === undefined || !type.startsWith(STEPS_PREFIX)) {
    throw new Error(`Unknown backoff strategy ${String(type)}`);
  }
  const delays = type.slice(STEPS_PREFIX.length).split(',').map(Number);
  return delays[Math.min(Math.max(attemptsMade, 1), delays.length) - 1] ?? 0;
};

/** `BullModule.registerQueue` options for a definition: retry policy and history limits. */
export function registerQueueOptions(definition: QueueDefinition): RegisterQueueOptions {
  return {
    name: definition.name,
    defaultJobOptions: {
      attempts: definition.attempts,
      backoff: definition.backoff,
      removeOnComplete: { count: KEEP_COMPLETED },
      removeOnFail: { count: KEEP_FAILED },
    },
  };
}

/** Options for `@Processor(queue.name, workerOptions())`: every worker understands `stepBackoff`. */
export function workerOptions(extra: NestWorkerOptions = {}): NestWorkerOptions {
  return { ...extra, settings: { ...extra.settings, backoffStrategy: stepBackoffStrategy } };
}
