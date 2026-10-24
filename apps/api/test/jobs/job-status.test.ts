import { createHmac, randomUUID } from 'node:crypto';
import {
  DEFAULT_STAGE_NAMES,
  FORBIDDEN,
  JOB_NOT_FOUND,
  JOB_NOT_READY,
  JOB_STATUS_TRANSITION_INVALID,
  JOB_VERSION_STALE,
  type JobAccessScope,
  jobHeaderSchema,
  type JobStatus,
  type WorkspaceRole,
} from '@ats/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobStages, jobs } from '../../src/database/schema.js';
import { accessFixtures } from '../access/fixtures.js';
import { startTestApp, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

/** Better Auth's session cookie; the test app runs with secure cookies (any env but development). */
const SESSION_COOKIE = '__Secure-better-auth.session_token';
/** `betterAuthSecret` of the test app. */
const SECRET = 'test-only-better-auth-secret-0123456789abcdef';

describe('POST /api/jobs/:id/status', () => {
  let api: TestApp;
  let database: Database;
  let fixtures: ReturnType<typeof accessFixtures>;

  beforeAll(async () => {
    api = await startTestApp();
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    fixtures = accessFixtures(database.db);
  });

  afterAll(async () => {
    await api.close();
    await database.close();
  });

  let workspaceId: string;
  let creatorId: string;
  let codeNumber: number;

  beforeEach(async () => {
    workspaceId = await fixtures.workspace('An Nhiên');
    creatorId = (await fixtures.user()).id;
    await fixtures.member(workspaceId, creatorId, 'admin');
    codeNumber = 0;
  });

  /** A signed session cookie for a new member of `workspaceId` with `role`. */
  async function memberCookie(role: WorkspaceRole) {
    const { id } = await fixtures.user();
    await fixtures.member(workspaceId, id, role);
    const token = await fixtures.session(id, { activeWorkspaceId: workspaceId });
    const signature = createHmac('sha256', SECRET).update(token).digest('base64');
    return {
      userId: id,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`,
    };
  }

  /** A job with the four default stages, as "Tạo vị trí" creates it. */
  async function createJob(
    options: {
      status?: JobStatus;
      accessScope?: JobAccessScope;
      assign?: string[];
      retireAllStages?: boolean;
    } = {},
  ) {
    codeNumber += 1;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId,
        code: `AN-${String(codeNumber).padStart(3, '0')}`,
        title: 'Product Designer',
        status: options.status ?? 'draft',
        accessScope: options.accessScope ?? 'normal',
        ownerUserId: creatorId,
        createdBy: creatorId,
      })
      .returning({ id: jobs.id, statusChangedAt: jobs.statusChangedAt });
    if (!job) throw new Error('no job returned');
    await database.db.insert(jobStages).values(
      DEFAULT_STAGE_NAMES.vi.map((name, position) => ({
        jobId: job.id,
        name,
        position,
        retiredAt: options.retireAllStages ? new Date() : null,
      })),
    );
    for (const userId of options.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return job;
  }

  function changeStatus(id: string, cookie: string, body: unknown) {
    return api.request(`/api/jobs/${id}/status`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function errorCode(response: Response, status: number) {
    expect(response.status).toBe(status);
    const body = (await response.json()) as Record<string, unknown>;
    return body.code;
  }

  async function stored(id: string) {
    const [row] = await database.db
      .select({ status: jobs.status, version: jobs.version, statusChangedAt: jobs.statusChangedAt })
      .from(jobs)
      .where(eq(jobs.id, id));
    return row!;
  }

  it('opens a new Draft job with its four default stages and answers the header, version + 1', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const response = await changeStatus(job.id, admin.cookie, { to: 'open', version: 1 });

    expect(response.status).toBe(200);
    expect(jobHeaderSchema.strict().parse(await response.json())).toEqual({
      id: job.id,
      code: 'AN-001',
      title: 'Product Designer',
      status: 'open',
      accessScope: 'normal',
      owner: { id: creatorId, name: 'Lan Test' },
      canEdit: true,
      version: 2,
    });
    const row = await stored(job.id);
    expect(row.status).toBe('open');
    expect(row.version).toBe(2);
    expect(row.statusChangedAt.getTime()).toBeGreaterThan(job.statusChangedAt.getTime());
  });

  it('walks the whole lifecycle: open, pause, resume, close, reopen', async () => {
    const recruiter = await memberCookie('recruiter');
    const job = await createJob();

    let version = 1;
    for (const to of ['open', 'paused', 'open', 'closed', 'open', 'paused', 'closed'] as const) {
      const response = await changeStatus(job.id, recruiter.cookie, { to, version });
      expect(response.status, to).toBe(200);
      const body = jobHeaderSchema.parse(await response.json());
      expect(body.status).toBe(to);
      expect(body.version).toBe(version + 1);
      version = body.version;
    }
  });

  it('refuses to open a Draft whose stages are all retired with 409 JOB_NOT_READY', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob({ retireAllStages: true });

    const response = await changeStatus(job.id, admin.cookie, { to: 'open', version: 1 });

    expect(await errorCode(response, 409)).toBe(JOB_NOT_READY);
    expect(await stored(job.id)).toMatchObject({ status: 'draft', version: 1 });
  });

  it('refuses Draft → Closed and Closed → Paused with 409 JOB_STATUS_TRANSITION_INVALID', async () => {
    const admin = await memberCookie('admin');
    const draft = await createJob();
    const closed = await createJob({ status: 'closed' });

    expect(
      await errorCode(
        await changeStatus(draft.id, admin.cookie, { to: 'closed', version: 1 }),
        409,
      ),
    ).toBe(JOB_STATUS_TRANSITION_INVALID);
    expect(
      await errorCode(
        await changeStatus(closed.id, admin.cookie, { to: 'paused', version: 1 }),
        409,
      ),
    ).toBe(JOB_STATUS_TRANSITION_INVALID);
    expect(
      await errorCode(
        await changeStatus(closed.id, admin.cookie, { to: 'closed', version: 1 }),
        409,
      ),
    ).toBe(JOB_STATUS_TRANSITION_INVALID);
    expect(await stored(draft.id)).toMatchObject({ status: 'draft', version: 1 });
    expect(await stored(closed.id)).toMatchObject({ status: 'closed', version: 1 });
  });

  it('answers an assigned collaborator 403 FORBIDDEN and changes nothing', async () => {
    const collaborator = await memberCookie('collaborator');
    const job = await createJob({ status: 'open', assign: [collaborator.userId] });

    const response = await changeStatus(job.id, collaborator.cookie, { to: 'paused', version: 1 });

    expect(await errorCode(response, 403)).toBe(FORBIDDEN);
    expect(await stored(job.id)).toMatchObject({ status: 'open', version: 1 });
  });

  it('answers a recruiter on an unassigned restricted job 404 JOB_NOT_FOUND, like a random id', async () => {
    const recruiter = await memberCookie('recruiter');
    const hidden = await createJob({ status: 'open', accessScope: 'restricted' });

    const hiddenResponse = await changeStatus(hidden.id, recruiter.cookie, {
      to: 'paused',
      version: 1,
    });
    const missingResponse = await changeStatus(randomUUID(), recruiter.cookie, {
      to: 'paused',
      version: 1,
    });

    expect(hiddenResponse.status).toBe(404);
    const hiddenBody: unknown = await hiddenResponse.json();
    expect(hiddenBody).toMatchObject({ code: JOB_NOT_FOUND });
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual(hiddenBody);
    expect(await stored(hidden.id)).toMatchObject({ status: 'open', version: 1 });
  });

  it('answers 404 JOB_NOT_FOUND for an id that is not a uuid', async () => {
    const admin = await memberCookie('admin');

    const response = await changeStatus('not-a-uuid', admin.cookie, { to: 'open', version: 1 });

    expect(await errorCode(response, 404)).toBe(JOB_NOT_FOUND);
  });

  it('lets a recruiter change an assigned restricted job', async () => {
    const recruiter = await memberCookie('recruiter');
    const job = await createJob({
      status: 'open',
      accessScope: 'restricted',
      assign: [recruiter.userId],
    });

    const response = await changeStatus(job.id, recruiter.cookie, { to: 'paused', version: 1 });

    expect(response.status).toBe(200);
  });

  it('answers the second of two requests with the same version 409 JOB_VERSION_STALE', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob({ status: 'open' });

    const first = await changeStatus(job.id, admin.cookie, { to: 'paused', version: 1 });
    const second = await changeStatus(job.id, admin.cookie, { to: 'closed', version: 1 });

    expect(first.status).toBe(200);
    expect(await errorCode(second, 409)).toBe(JOB_VERSION_STALE);
    expect(await stored(job.id)).toMatchObject({ status: 'paused', version: 2 });
  });

  it('lets exactly one of two concurrent requests with the same version through', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob({ status: 'open' });

    const responses = await Promise.all([
      changeStatus(job.id, admin.cookie, { to: 'paused', version: 1 }),
      changeStatus(job.id, admin.cookie, { to: 'closed', version: 1 }),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect(await errorCode(refused, 409)).toBe(JOB_VERSION_STALE);
    expect((await stored(job.id)).version).toBe(2);
  });

  it('answers 400 VALIDATION_FAILED for a malformed body', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    for (const body of [{}, { to: 'archived', version: 1 }, { to: 'open', version: 'x' }]) {
      expect(await errorCode(await changeStatus(job.id, admin.cookie, body), 400)).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect(await stored(job.id)).toMatchObject({ status: 'draft', version: 1 });
  });

  it('answers 401 without a session', async () => {
    const job = await createJob();

    const response = await api.request(`/api/jobs/${job.id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'open', version: 1 }),
    });

    expect(response.status).toBe(401);
  });
});
