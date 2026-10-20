import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { actorFor } from './access.guard.js';
import type { AccessResult, SessionActor, WorkspaceActor } from './resolve-access.js';

const user = {
  id: 'u1',
  name: 'Lan Test',
  email: 'lan@example.test',
  locale: 'vi' as const,
  emailVerified: true,
};
const sessionActor: SessionActor = { user, sessionToken: 't', workspaceId: null };
const workspaceActor: WorkspaceActor = {
  user,
  sessionToken: 't',
  workspaceId: 'w1',
  role: 'recruiter',
};

const member: AccessResult = { ok: true, actor: workspaceActor };
const noSession: AccessResult = { ok: false, code: 'UNAUTHENTICATED' };
const noWorkspace: AccessResult = { ok: false, code: 'WORKSPACE_REQUIRED', actor: sessionActor };
const revoked: AccessResult = {
  ok: false,
  code: 'WORKSPACE_ACCESS_REVOKED',
  actor: sessionActor,
};

function failure(run: () => unknown): { status: number; code: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpException) {
      return { status: error.getStatus(), code: (error.getResponse() as { code?: unknown }).code };
    }
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('actorFor', () => {
  describe('on a route that needs a workspace', () => {
    it('lets an active member through with their role', () => {
      expect(actorFor(member, 'workspace')).toBe(workspaceActor);
    });

    it('answers 401 UNAUTHENTICATED without a session', () => {
      expect(failure(() => actorFor(noSession, 'workspace'))).toEqual({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(() => actorFor(noSession, 'workspace')).toThrow(UnauthorizedException);
    });

    it('answers 403 WORKSPACE_REQUIRED without an active workspace', () => {
      expect(failure(() => actorFor(noWorkspace, 'workspace'))).toEqual({
        status: 403,
        code: 'WORKSPACE_REQUIRED',
      });
    });

    it('answers 403 WORKSPACE_ACCESS_REVOKED without an active membership', () => {
      expect(failure(() => actorFor(revoked, 'workspace'))).toEqual({
        status: 403,
        code: 'WORKSPACE_ACCESS_REVOKED',
      });
      expect(() => actorFor(revoked, 'workspace')).toThrow(ForbiddenException);
    });
  });

  describe('on a @SessionOnly() route', () => {
    it('still answers 401 UNAUTHENTICATED without a session', () => {
      expect(failure(() => actorFor(noSession, 'session'))).toEqual({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
    });

    it('lets the user through without a workspace or with a revoked one', () => {
      expect(actorFor(noWorkspace, 'session')).toBe(sessionActor);
      expect(actorFor(revoked, 'session')).toBe(sessionActor);
    });

    it('keeps the workspace and role when the membership is active', () => {
      expect(actorFor(member, 'session')).toBe(workspaceActor);
    });
  });
});
