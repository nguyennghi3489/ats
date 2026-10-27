import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  changeJobStatusRequestSchema,
  JOB_NOT_READY,
  JOB_STATUS_ERROR_CODES,
  JOB_STATUS_TRANSITION_INVALID,
  JOB_STATUSES,
  JOB_VERSION_STALE,
  type JobStatus,
} from './index.js';

/** Every allowed move of the decisions §5 lifecycle; every other pair is refused. */
const LIFECYCLE: ReadonlyArray<readonly [JobStatus, JobStatus]> = [
  ['draft', 'open'],
  ['open', 'paused'],
  ['paused', 'open'],
  ['open', 'closed'],
  ['paused', 'closed'],
  ['closed', 'open'],
];

const allowed = (from: JobStatus, to: JobStatus) =>
  LIFECYCLE.some(([a, b]) => a === from && b === to);

describe('job status lifecycle (decisions §5)', () => {
  for (const from of JOB_STATUSES) {
    for (const to of JOB_STATUSES) {
      const expected = allowed(from, to);
      it(`${expected ? 'allows' : 'refuses'} ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(expected);
        expect(allowedTransitions(from).includes(to)).toBe(expected);
      });
    }
  }

  it('lists the moves of each status in menu order', () => {
    expect(allowedTransitions('draft')).toEqual(['open']);
    expect(allowedTransitions('open')).toEqual(['paused', 'closed']);
    expect(allowedTransitions('paused')).toEqual(['open', 'closed']);
    expect(allowedTransitions('closed')).toEqual(['open']);
  });

  it('never allows staying on the same status', () => {
    for (const status of JOB_STATUSES) expect(canTransition(status, status)).toBe(false);
  });
});

describe('POST /api/jobs/:id/status body', () => {
  it('takes a target status and a positive integer version', () => {
    expect(changeJobStatusRequestSchema.parse({ to: 'open', version: 3 })).toEqual({
      to: 'open',
      version: 3,
    });
  });

  it('refuses unknown statuses, missing or non-integer versions and extra keys', () => {
    for (const body of [
      { to: 'archived', version: 1 },
      { to: 'open' },
      { to: 'open', version: 0 },
      { to: 'open', version: 1.5 },
      { to: 'open', version: '1' },
      { to: 'open', version: 1, status: 'closed' },
      null,
    ]) {
      expect(changeJobStatusRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('job status error codes', () => {
  it('names the 409 answers of a status change', () => {
    expect(JOB_STATUS_TRANSITION_INVALID).toBe('JOB_STATUS_TRANSITION_INVALID');
    expect(JOB_VERSION_STALE).toBe('JOB_VERSION_STALE');
    expect(JOB_NOT_READY).toBe('JOB_NOT_READY');
    expect(JOB_STATUS_ERROR_CODES).toEqual([
      JOB_STATUS_TRANSITION_INVALID,
      JOB_VERSION_STALE,
      JOB_NOT_READY,
    ]);
  });
});
