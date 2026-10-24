import { JOB_STATUSES } from '@ats/shared';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import vi from './locales/vi.json';

// QA for #123: a label for every shared job status, in both languages, with the issue's copy.
// `jobs.status.actions` holds the "Thao tác tuyển dụng" copy (#130), not status labels.
function labels(status: typeof vi.jobs.status) {
  const statuses: Partial<typeof status> = { ...status };
  delete statuses.actions;
  return statuses;
}

describe('QA #123: jobs.status labels', () => {
  it('has a vi label for every status, with the documented copy', () => {
    expect(Object.keys(labels(vi.jobs.status)).sort()).toEqual([...JOB_STATUSES].sort());
    expect(labels(vi.jobs.status)).toEqual({
      draft: 'Bản nháp',
      open: 'Đang mở tuyển',
      paused: 'Tạm dừng',
      closed: 'Đã đóng',
    });
  });

  it('has an en label for every status, with the documented copy', () => {
    expect(Object.keys(labels(en.jobs.status)).sort()).toEqual([...JOB_STATUSES].sort());
    expect(labels(en.jobs.status)).toEqual({
      draft: 'Draft',
      open: 'Open',
      paused: 'Paused',
      closed: 'Closed',
    });
  });
});
