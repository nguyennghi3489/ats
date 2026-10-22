import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_METADATA_EXAMPLES,
  auditActionSchema,
  auditMetadataSchema,
  auditTargetType,
  type AuditAction,
} from './index.js';

describe('AUDIT_ACTIONS', () => {
  it('lists the sensitive actions of decisions §13', () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      'member.role_changed',
      'member.deactivated',
      'member.reactivated',
      'job.scope_changed',
      'candidate.erased',
      'cv.attached',
      'cv.claude_extraction',
    ]);
  });

  it('rejects an action that is not listed', () => {
    expect(auditActionSchema.safeParse('member.deleted').success).toBe(false);
  });

  it('gives every action a target type', () => {
    expect(auditTargetType('member.role_changed')).toBe('member');
    expect(auditTargetType('job.scope_changed')).toBe('job');
    expect(auditTargetType('candidate.erased')).toBe('candidate');
    expect(auditTargetType('cv.attached')).toBe('application');
    expect(auditTargetType('cv.claude_extraction')).toBe('cv_upload');
  });
});

describe('auditMetadataSchema', () => {
  it.each(AUDIT_ACTIONS)('%s accepts its documented example', (action) => {
    const example = AUDIT_METADATA_EXAMPLES[action];
    expect(auditMetadataSchema(action).parse(example)).toEqual(example);
  });

  it.each(
    AUDIT_ACTIONS.flatMap((action) => ['email', 'name', 'phone'].map((key) => [action, key])),
  )('%s rejects the unknown key %s', (action, key) => {
    const metadata = { ...AUDIT_METADATA_EXAMPLES[action as AuditAction], [key]: 'Lan Nguyễn' };
    expect(auditMetadataSchema(action as AuditAction).safeParse(metadata).success).toBe(false);
  });

  it('rejects free text where an id belongs', () => {
    expect(
      auditMetadataSchema('cv.attached').safeParse({ cvId: 'lan@example.test', previousCvId: null })
        .success,
    ).toBe(false);
    expect(
      auditMetadataSchema('cv.attached').safeParse({ cvId: 'Lan Nguyen', previousCvId: null })
        .success,
    ).toBe(false);
  });

  it('rejects values outside the enums', () => {
    expect(
      auditMetadataSchema('member.role_changed').safeParse({ fromRole: 'admin', toRole: 'owner' })
        .success,
    ).toBe(false);
    expect(
      auditMetadataSchema('job.scope_changed').safeParse({
        fromScope: 'normal',
        toScope: 'secret',
      }).success,
    ).toBe(false);
  });

  it('rejects negative or fractional counts', () => {
    expect(
      auditMetadataSchema('member.deactivated').safeParse({ removedAssignmentCount: -1 }).success,
    ).toBe(false);
    expect(
      auditMetadataSchema('candidate.erased').safeParse({
        applicationCount: 1.5,
        deletedFileCount: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects a role change to the same role', () => {
    expect(
      auditMetadataSchema('member.role_changed').safeParse({ fromRole: 'admin', toRole: 'admin' })
        .success,
    ).toBe(false);
  });

  it('rejects missing required keys', () => {
    expect(
      auditMetadataSchema('job.scope_changed').safeParse({ fromScope: 'normal' }).success,
    ).toBe(false);
  });

  it('accepts only an empty object for a reactivation', () => {
    expect(auditMetadataSchema('member.reactivated').safeParse({}).success).toBe(true);
    expect(auditMetadataSchema('member.reactivated').safeParse({ note: 'x' }).success).toBe(false);
  });

  it('accepts an ISO timestamp and rejects free text in a timestamp field', () => {
    const base = AUDIT_METADATA_EXAMPLES['cv.claude_extraction'];
    expect(
      auditMetadataSchema('cv.claude_extraction').safeParse({
        ...base,
        requestedAt: '2026-10-20T09:30:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      auditMetadataSchema('cv.claude_extraction').safeParse({ ...base, requestedAt: 'Lan Nguyen' })
        .success,
    ).toBe(false);
  });
});
