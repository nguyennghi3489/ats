import { defineQueue } from './queue-definition.js';

/**
 * Sample queue that proves the worker wiring end to end. Producers enqueue, the worker logs the
 * job id. The optional fields let a developer or QA see retries and graceful shutdown happen.
 */
export const PING_QUEUE = defineQueue('ping', {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
});

export interface PingJobData {
  /** Throw on this many attempts before succeeding (retry demo). */
  failAttempts?: number;
  /** Work this long before answering (graceful shutdown demo). */
  durationMs?: number;
}

export interface PingResult {
  pong: true;
}
