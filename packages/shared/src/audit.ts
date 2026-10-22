import { z } from 'zod';
import { workspaceRoleSchema } from './workspaces.js';

/**
 * Sensitive actions written to the append-only audit log (decisions §13). An entry never holds
 * personal data (§7 erase) or content sent to Claude (§8): its metadata allows only ids, enums,
 * counts and timestamps, and every metadata schema rejects unknown keys.
 */
export const AUDIT_ACTIONS = [
  'member.role_changed',
  'member.deactivated',
  'member.reactivated',
  'job.scope_changed',
  'candidate.erased',
  'cv.attached',
  'cv.claude_extraction',
] as const;

export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export type AuditAction = z.infer<typeof auditActionSchema>;

/** What an audit entry's `target_id` points at. */
export const AUDIT_TARGET_TYPES = [
  'member',
  'job',
  'candidate',
  'application',
  'cv_upload',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * A record id (uuid or Better Auth id): letters, digits, `_` and `-` only, so an email or a name
 * cannot pass as one.
 */
const auditIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const countSchema = z.number().int().min(0);

/** Same values as the jobs `access_scope` column (decisions §3: normal vs restricted jobs). */
const jobAccessScopeSchema = z.enum(['normal', 'restricted']);

/** How a Claude fallback call ended. */
export const CLAUDE_EXTRACTION_OUTCOMES = ['succeeded', 'failed', 'timed_out'] as const;

const auditMetadataSchemas = {
  /** Admin changed a member's role. */
  'member.role_changed': z
    .strictObject({ fromRole: workspaceRoleSchema, toRole: workspaceRoleSchema })
    .refine((value) => value.fromRole !== value.toRole, { path: ['toRole'] }),
  /** Admin deactivated a member; their job assignments were removed in the same transaction. */
  'member.deactivated': z.strictObject({ removedAssignmentCount: countSchema }),
  /** Admin reactivated a member. */
  'member.reactivated': z.strictObject({}),
  /** Admin changed a job's access scope. */
  'job.scope_changed': z
    .strictObject({ fromScope: jobAccessScopeSchema, toScope: jobAccessScopeSchema })
    .refine((value) => value.fromScope !== value.toScope, { path: ['toScope'] }),
  /** Admin erased an archived candidate's personal data. */
  'candidate.erased': z.strictObject({
    applicationCount: countSchema,
    deletedFileCount: countSchema,
  }),
  /** A profile CV version was attached to an application, replacing `previousCvId` if any. */
  'cv.attached': z.strictObject({ cvId: auditIdSchema, previousCvId: auditIdSchema.nullable() }),
  /** One Claude fallback call for a CV upload; never the text sent or received. */
  'cv.claude_extraction': z.strictObject({
    outcome: z.enum(CLAUDE_EXTRACTION_OUTCOMES),
    inputCharCount: countSchema,
    durationMs: countSchema,
    requestedAt: z.iso.datetime().optional(),
  }),
} satisfies Record<AuditAction, z.ZodType>;

export type AuditMetadata<A extends AuditAction = AuditAction> = z.infer<
  (typeof auditMetadataSchemas)[A]
>;

/** The strict metadata schema of `action`. */
export function auditMetadataSchema<A extends AuditAction>(
  action: A,
): (typeof auditMetadataSchemas)[A] {
  return auditMetadataSchemas[action];
}

const auditTargetTypes: Record<AuditAction, AuditTargetType> = {
  'member.role_changed': 'member',
  'member.deactivated': 'member',
  'member.reactivated': 'member',
  'job.scope_changed': 'job',
  'candidate.erased': 'candidate',
  'cv.attached': 'application',
  'cv.claude_extraction': 'cv_upload',
};

/** The kind of record an entry for `action` targets. */
export function auditTargetType(action: AuditAction): AuditTargetType {
  return auditTargetTypes[action];
}

/** A valid metadata value for each action, as documented for callers. */
export const AUDIT_METADATA_EXAMPLES: { [A in AuditAction]: AuditMetadata<A> } = {
  'member.role_changed': { fromRole: 'recruiter', toRole: 'admin' },
  'member.deactivated': { removedAssignmentCount: 3 },
  'member.reactivated': {},
  'job.scope_changed': { fromScope: 'normal', toScope: 'restricted' },
  'candidate.erased': { applicationCount: 2, deletedFileCount: 4 },
  'cv.attached': { cvId: '0b7e2c1a-3f4d-4e5a-9b6c-7d8e9f0a1b2c', previousCvId: null },
  'cv.claude_extraction': { outcome: 'succeeded', inputCharCount: 5120, durationMs: 8300 },
};
