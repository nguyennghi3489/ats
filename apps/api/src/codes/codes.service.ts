import { APPLICATION_CODE_PREFIX, type CodeKind, formatCode } from '@ats/shared';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { organization } from '../auth/auth.schema.js';
import type { Transaction } from '../database/database.js';
import { workspaceCounters } from './codes.schema.js';

/**
 * Hands out job codes (`{PREFIX}-{NNN}`) and application codes (`ỨT-{NNN}`), numbered per workspace
 * (decisions §5).
 */
@Injectable()
export class CodesService {
  /**
   * Takes the next number of `workspaceId`'s `kind` counter with one
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING` on the caller's transaction, and formats it.
   * The counter row stays locked until that transaction ends, so concurrent callers queue and never
   * get the same number; if the transaction rolls back, so does the increment, together with the
   * record that would have carried the code. Throws when the workspace does not exist.
   */
  async nextCode(tx: Transaction, workspaceId: string, kind: CodeKind): Promise<string> {
    const [counter] = await tx
      .insert(workspaceCounters)
      .values({ workspaceId, kind, lastValue: 1 })
      .onConflictDoUpdate({
        target: [workspaceCounters.workspaceId, workspaceCounters.kind],
        set: { lastValue: sql`${workspaceCounters.lastValue} + 1` },
      })
      .returning({ lastValue: workspaceCounters.lastValue });
    if (!counter) {
      throw new Error('workspace counter returned no row');
    }
    return formatCode(await this.prefix(tx, workspaceId, kind), counter.lastValue);
  }

  private async prefix(tx: Transaction, workspaceId: string, kind: CodeKind): Promise<string> {
    if (kind === 'application') {
      return APPLICATION_CODE_PREFIX;
    }
    const [workspace] = await tx
      .select({ codePrefix: organization.codePrefix })
      .from(organization)
      .where(eq(organization.id, workspaceId));
    if (!workspace) {
      throw new Error('workspace not found');
    }
    return workspace.codePrefix;
  }
}
