import { describe, expect, it } from 'vitest';
import { jobStagesSchema } from './index.js';

const stages = {
  jobId: '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e',
  version: 3,
  canEdit: true,
  active: [
    { id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c01', name: 'Mới', position: 1 },
    { id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c02', name: 'Sơ loại', position: 2 },
  ],
  retired: [
    {
      id: '0b7d6a52-1c1e-4d8b-9a33-6a1f0e2d4c09',
      name: 'Portfolio review',
      retiredAt: '2026-10-20T08:30:00.000Z',
    },
  ],
};

describe('jobStagesSchema', () => {
  it('parses the stages response', () => {
    expect(jobStagesSchema.parse(stages)).toEqual(stages);
    expect(jobStagesSchema.parse({ ...stages, retired: [] }).retired).toEqual([]);
  });

  it('rejects a stage without a name', () => {
    const activeWithoutName: Record<string, unknown> = { ...stages.active[0] };
    delete activeWithoutName.name;
    expect(jobStagesSchema.safeParse({ ...stages, active: [activeWithoutName] }).success).toBe(
      false,
    );

    const retiredWithoutName: Record<string, unknown> = { ...stages.retired[0] };
    delete retiredWithoutName.name;
    expect(jobStagesSchema.safeParse({ ...stages, retired: [retiredWithoutName] }).success).toBe(
      false,
    );
  });

  it('requires the job version, canEdit and a timestamp on retired stages', () => {
    const withoutVersion: Record<string, unknown> = { ...stages };
    delete withoutVersion.version;
    expect(jobStagesSchema.safeParse(withoutVersion).success).toBe(false);
    expect(jobStagesSchema.safeParse({ ...stages, canEdit: 'yes' }).success).toBe(false);
    expect(
      jobStagesSchema.safeParse({
        ...stages,
        retired: [{ ...stages.retired[0], retiredAt: 'yesterday' }],
      }).success,
    ).toBe(false);
  });
});
