import { FORBIDDEN, JOB_NOT_FOUND, type JobAccessScope, type WorkspaceRole } from '@ats/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  canCreateJob,
  canEditJob,
  canViewJob,
  forbidden,
  type JobAccessActor,
  jobNotFound,
  visibleJobsFilter,
} from './jobs.access.js';

const WORKSPACE = 'w1';

function actor(role: WorkspaceRole, workspaceId = WORKSPACE): JobAccessActor {
  return { user: { id: 'u1' }, workspaceId, role };
}

function job(accessScope: JobAccessScope, assignedToActor: boolean, workspaceId = WORKSPACE) {
  return { workspaceId, accessScope, assignedToActor };
}

/**
 * The jobs rows of the decisions §3 role table, cell by cell:
 * [role, scope, assigned] → [can see, can edit].
 */
const ROLE_TABLE: [WorkspaceRole, JobAccessScope, boolean, boolean, boolean][] = [
  ['admin', 'normal', false, true, true],
  ['admin', 'normal', true, true, true],
  ['admin', 'restricted', false, true, true],
  ['admin', 'restricted', true, true, true],
  ['recruiter', 'normal', false, true, true],
  ['recruiter', 'normal', true, true, true],
  ['recruiter', 'restricted', false, false, false],
  ['recruiter', 'restricted', true, true, true],
  ['collaborator', 'normal', false, false, false],
  ['collaborator', 'normal', true, true, false],
  ['collaborator', 'restricted', false, false, false],
  ['collaborator', 'restricted', true, true, false],
];

describe('job rules (decisions §3 role table)', () => {
  describe.each(ROLE_TABLE)(
    '%s on a %s job (assigned: %s)',
    (role, scope, assigned, canSee, canEdit) => {
      it(canSee ? 'can see it' : 'cannot see it', () => {
        expect(canViewJob(actor(role), job(scope, assigned))).toBe(canSee);
      });

      it(canEdit ? 'can edit it' : 'cannot edit it', () => {
        expect(canEditJob(actor(role), job(scope, assigned))).toBe(canEdit);
      });
    },
  );

  it.each<WorkspaceRole>(['admin', 'recruiter', 'collaborator'])(
    'never lets a %s see or edit a job of another workspace',
    (role) => {
      for (const scope of ['normal', 'restricted'] as const) {
        for (const assigned of [false, true]) {
          const foreign = job(scope, assigned, 'w2');
          expect(canViewJob(actor(role), foreign)).toBe(false);
          expect(canEditJob(actor(role), foreign)).toBe(false);
        }
      }
    },
  );

  it.each<[WorkspaceRole, boolean]>([
    ['admin', true],
    ['recruiter', true],
    ['collaborator', false],
  ])('lets a %s create jobs: %s', (role, allowed) => {
    expect(canCreateJob(actor(role))).toBe(allowed);
  });
});

describe('visibleJobsFilter', () => {
  const dialect = new PgDialect();

  it.each<WorkspaceRole>(['admin', 'recruiter', 'collaborator'])(
    'always scopes a %s to their workspace',
    (role) => {
      const { sql, params } = dialect.sqlToQuery(visibleJobsFilter(actor(role)));
      expect(sql).toContain('"jobs"."workspace_id" = $1');
      expect(params[0]).toBe(WORKSPACE);
    },
  );

  it('checks assignments only for recruiters and collaborators', () => {
    const query = (role: WorkspaceRole) => dialect.sqlToQuery(visibleJobsFilter(actor(role)));
    expect(query('admin').sql).not.toContain('job_assignments');
    expect(query('recruiter').sql).toContain('"jobs"."access_scope" = $2');
    expect(query('recruiter').sql).toContain('exists');
    expect(query('recruiter').params).toEqual([WORKSPACE, 'normal', 'u1']);
    expect(query('collaborator').sql).not.toContain('access_scope');
    expect(query('collaborator').params).toEqual([WORKSPACE, 'u1']);
  });
});

describe('job access errors', () => {
  it('answers 404 JOB_NOT_FOUND, the same body for missing and hidden jobs', () => {
    const error = jobNotFound();
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({ code: JOB_NOT_FOUND, message: 'Job not found' });
    expect(jobNotFound().getResponse()).toEqual(error.getResponse());
  });

  it('answers 403 FORBIDDEN for a visible job the role may not change', () => {
    const error = forbidden();
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({ code: FORBIDDEN, message: 'Forbidden' });
  });
});
