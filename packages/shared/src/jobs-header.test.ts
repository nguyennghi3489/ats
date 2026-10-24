import { describe, expect, it } from 'vitest';
import { jobHeaderSchema } from './index.js';

const header = {
  id: '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e',
  code: 'AN-001',
  title: 'Product Designer',
  status: 'draft',
  accessScope: 'normal',
  owner: { id: 'usr_1', name: 'Minh Anh' },
  canEdit: true,
  version: 1,
};

describe('jobHeaderSchema', () => {
  it('accepts the job page header, with or without an owner', () => {
    expect(jobHeaderSchema.parse(header)).toEqual(header);
    expect(jobHeaderSchema.parse({ ...header, owner: null }).owner).toBeNull();
  });

  it('requires the access scope and whether the caller may edit', () => {
    expect(jobHeaderSchema.safeParse({ ...header, accessScope: 'secret' }).success).toBe(false);
    const withoutCanEdit: Record<string, unknown> = { ...header };
    delete withoutCanEdit.canEdit;
    expect(jobHeaderSchema.safeParse(withoutCanEdit).success).toBe(false);
  });

  it('requires the version a later change sends back', () => {
    const withoutVersion: Record<string, unknown> = { ...header };
    delete withoutVersion.version;
    expect(jobHeaderSchema.safeParse(withoutVersion).success).toBe(false);
    expect(jobHeaderSchema.safeParse({ ...header, version: 0 }).success).toBe(false);
  });
});
