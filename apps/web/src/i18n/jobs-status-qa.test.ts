import { JOB_STATUSES } from '@ats/shared';
import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import vi from './locales/vi.json';

// QA for #123: a label for every shared job status, in both languages, with the issue's copy.
describe('QA #123: jobs.status labels', () => {
  it('has a vi label for every status, with the documented copy', () => {
    expect(Object.keys(vi.jobs.status).sort()).toEqual([...JOB_STATUSES].sort());
    expect(vi.jobs.status).toEqual({
      draft: 'Bản nháp',
      open: 'Đang mở tuyển',
      paused: 'Tạm dừng',
      closed: 'Đã đóng',
    });
  });

  it('has an en label for every status, with the documented copy', () => {
    expect(Object.keys(en.jobs.status).sort()).toEqual([...JOB_STATUSES].sort());
    expect(en.jobs.status).toEqual({
      draft: 'Draft',
      open: 'Open',
      paused: 'Paused',
      closed: 'Closed',
    });
  });
});
