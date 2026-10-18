import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { PingJobData } from '../queue/ping.queue.js';
import { PingProcessor } from './ping.processor.js';

function pingJob(data: PingJobData, attemptsMade = 0): Job<PingJobData> {
  return { id: '42', name: 'ping', data, attemptsMade, opts: { attempts: 3 } } as Job<PingJobData>;
}

describe('PingProcessor', () => {
  let log: MockInstance<Logger['log']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the job id and answers pong', async () => {
    const result = await new PingProcessor().process(pingJob({}));

    expect(result).toEqual({ pong: true });
    expect(log).toHaveBeenCalledWith('ping processed', { jobId: '42', attempt: 1 });
  });

  it('fails the first attempts when asked to, then succeeds', async () => {
    const processor = new PingProcessor();

    await expect(processor.process(pingJob({ failAttempts: 2 }, 0))).rejects.toThrow(
      'PING_FAILED_ON_PURPOSE',
    );
    await expect(processor.process(pingJob({ failAttempts: 2 }, 1))).rejects.toThrow(
      'PING_FAILED_ON_PURPOSE',
    );
    await expect(processor.process(pingJob({ failAttempts: 2 }, 2))).resolves.toEqual({
      pong: true,
    });
    expect(log).toHaveBeenLastCalledWith('ping processed', { jobId: '42', attempt: 3 });
  });

  it('takes as long as the job asks before answering', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const running = new PingProcessor().process(pingJob({ durationMs: 5_000 })).then(() => {
        done = true;
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await running;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
