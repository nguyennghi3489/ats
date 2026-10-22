import {
  type AuditAction,
  type AuditMetadata,
  auditMetadataSchema,
  auditTargetType,
} from '@ats/shared';
import { Injectable } from '@nestjs/common';
import type { Transaction } from '../database/database.js';
import { auditLog } from './audit.schema.js';

/** One audit entry for `action`; the target type follows from the action. */
export type AuditEntry = {
  [A in AuditAction]: {
    workspaceId: string;
    /** `null` for actions the system takes on its own (e.g. a worker's Claude call). */
    actorUserId: string | null;
    action: A;
    targetId: string;
    metadata: AuditMetadata<A>;
  };
}[AuditAction];

/**
 * Thrown by `record` when metadata does not match the action's schema: a programming error, so it
 * rolls back the caller's transaction. The message names the offending paths, never their values.
 */
export class AuditMetadataInvalidError extends Error {
  readonly code = 'AUDIT_METADATA_INVALID';

  constructor(
    readonly action: AuditAction,
    readonly paths: string[],
  ) {
    super(`invalid audit metadata for ${action}: ${paths.join(', ') || '(root)'}`);
    this.name = 'AuditMetadataInvalidError';
  }
}

/**
 * Writes the append-only audit log (decisions §13). It can only add entries: there is deliberately
 * no update or delete method.
 */
@Injectable()
export class AuditService {
  /**
   * Validates `entry.metadata` against the action's strict schema (throws
   * `AuditMetadataInvalidError`) and inserts one row with the caller's transaction, so the entry
   * commits or rolls back together with the change it records.
   */
  async record(tx: Transaction, entry: AuditEntry): Promise<void> {
    const parsed = auditMetadataSchema(entry.action).safeParse(entry.metadata);
    if (!parsed.success) {
      const paths = parsed.error.issues.flatMap((issue) => {
        const base = issue.path.map(String);
        if (issue.code === 'unrecognized_keys') {
          return issue.keys.map((key) => [...base, key].join('.'));
        }
        return [base.join('.')];
      });
      throw new AuditMetadataInvalidError(entry.action, paths);
    }
    await tx.insert(auditLog).values({
      workspaceId: entry.workspaceId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: auditTargetType(entry.action),
      targetId: entry.targetId,
      metadata: parsed.data,
    });
  }
}
