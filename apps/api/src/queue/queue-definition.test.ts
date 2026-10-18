import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF,
  defineQueue,
  registerQueueOptions,
  stepBackoff,
  stepBackoffStrategy,
  workerOptions,
} from './queue-definition.js';

describe('defineQueue', () => {
  it('applies the default attempts and backoff', () => {
    expect(defineQueue('mail')).toEqual({
      name: 'mail',
      attempts: DEFAULT_ATTEMPTS,
      backoff: DEFAULT_BACKOFF,
    });
  });

  it('keeps custom attempts and backoff', () => {
    expect(
      defineQueue('cv', { attempts: 4, backoff: stepBackoff([10_000, 30_000, 90_000]) }),
    ).toEqual({ name: 'cv', attempts: 4, backoff: { type: 'steps:10000,30000,90000' } });
  });

  it('rejects fewer than one attempt', () => {
    expect(() => defineQueue('bad', { attempts: 0 })).toThrow(/attempts/);
  });
});

describe('registerQueueOptions', () => {
  it('turns the definition into default job options', () => {
    const options = registerQueueOptions(defineQueue('mail', { attempts: 5 }));

    expect(options.name).toBe('mail');
    expect(options.defaultJobOptions).toMatchObject({ attempts: 5, backoff: DEFAULT_BACKOFF });
  });
});

describe('stepBackoff', () => {
  it('rejects an empty or negative schedule', () => {
    expect(() => stepBackoff([])).toThrow();
    expect(() => stepBackoff([1000, -1])).toThrow();
  });
});

describe('stepBackoffStrategy', () => {
  const type = stepBackoff([10_000, 30_000, 90_000]).type;
  const job = {} as Job;

  it('waits the listed delay for each retry', () => {
    expect(stepBackoffStrategy(1, type, undefined, job)).toBe(10_000);
    expect(stepBackoffStrategy(2, type, undefined, job)).toBe(30_000);
    expect(stepBackoffStrategy(3, type, undefined, job)).toBe(90_000);
  });

  it('repeats the last delay when attempts outnumber the schedule', () => {
    expect(stepBackoffStrategy(7, type, undefined, job)).toBe(90_000);
  });

  it('refuses an unknown backoff type', () => {
    expect(() => stepBackoffStrategy(1, 'linear', undefined, job)).toThrow(/linear/);
  });
});

describe('workerOptions', () => {
  it('installs the step backoff strategy and keeps extra options', () => {
    const options = workerOptions({ concurrency: 2 });

    expect(options.settings?.backoffStrategy).toBe(stepBackoffStrategy);
    expect(options.concurrency).toBe(2);
  });
});
