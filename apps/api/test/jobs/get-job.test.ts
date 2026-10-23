import { createHmac, randomUUID } from 'node:crypto';
import {
  JOB_NOT_FOUND,
  type JobAccessScope,
  jobHeaderSchema,
  type WorkspaceRole,
} from '@ats/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { accessFixtures } from '../access/fixtures.js';
import { startTestApp, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

/** Better Auth's session cookie; the test app runs with secure cookies (any env but development). */
const SESSION_COOKIE = '__Secure-better-auth.session_token';
/** `betterAuthSecret` of the test app. */
const SECRET = 'test-only-better-auth-secret-0123456789abcdef';

describe('GET /api/jobs/:id', () => {
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

  /** A signed session cookie for a new member of `inWorkspace` with `role`. */
  async function memberCookie(role: WorkspaceRole, inWorkspace = workspaceId) {
    const { id } = await fixtures.user();
    await fixtures.member(inWorkspace, id, role);
    const token = await fixtures.session(id, { activeWorkspaceId: inWorkspace });
    const signature = createHmac('sha256', SECRET).update(token).digest('base64');
    return {
      userId: id,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`,
    };
  }

  async function createJob(
    options: {
      accessScope?: JobAccessScope;
      workspaceId?: string;
      assign?: string[];
      owner?: string | null;
    } = {},
  ) {
    codeNumber += 1;
    const code = `AN-${String(codeNumber).padStart(3, '0')}`;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId: options.workspaceId ?? workspaceId,
        code,
        title: 'Product Designer',
        accessScope: options.accessScope ?? 'normal',
        ownerUserId: options.owner === undefined ? creatorId : options.owner,
        createdBy: creatorId,
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error('no job returned');
    for (const userId of options.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return { id: job.id, code };
  }

  function getJob(id: string, cookie: string) {
    return api.request(`/api/jobs/${id}`, { headers: { cookie } });
  }

  async function notFoundBody(response: Response) {
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe(JOB_NOT_FOUND);
    return body;
  }

  it('gives an admin the header data with canEdit: true', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const response = await getJob(job.id, admin.cookie);

    expect(response.status).toBe(200);
    const body = jobHeaderSchema.strict().parse(await response.json());
    expect(body).toEqual({
      id: job.id,
      code: 'AN-001',
      title: 'Product Designer',
      status: 'draft',
      accessScope: 'normal',
      owner: { id: creatorId, name: 'Lan Test' },
      canEdit: true,
    });
  });

  it('answers owner: null for a job without an owner', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob({ owner: null });

    const response = await getJob(job.id, admin.cookie);

    expect(response.status).toBe(200);
    expect(jobHeaderSchema.parse(await response.json()).owner).toBeNull();
  });

  it('gives an assigned collaborator the header data with canEdit: false', async () => {
    const collaborator = await memberCookie('collaborator');
    const job = await createJob({ accessScope: 'restricted', assign: [collaborator.userId] });

    const response = await getJob(job.id, collaborator.cookie);

    expect(response.status).toBe(200);
    expect(jobHeaderSchema.parse(await response.json())).toMatchObject({
      id: job.id,
      accessScope: 'restricted',
      canEdit: false,
    });
  });

  it('gives a recruiter canEdit: true on a normal job and an assigned restricted one', async () => {
    const recruiter = await memberCookie('recruiter');
    const normal = await createJob();
    const restricted = await createJob({ accessScope: 'restricted', assign: [recruiter.userId] });

    for (const job of [normal, restricted]) {
      const response = await getJob(job.id, recruiter.cookie);
      expect(response.status).toBe(200);
      expect(jobHeaderSchema.parse(await response.json()).canEdit).toBe(true);
    }
  });

  it('answers a recruiter asking for an unassigned restricted job exactly like a random uuid', async () => {
    const recruiter = await memberCookie('recruiter');
    const hidden = await createJob({ accessScope: 'restricted' });

    const hiddenBody = await notFoundBody(await getJob(hidden.id, recruiter.cookie));
    const missingBody = await notFoundBody(await getJob(randomUUID(), recruiter.cookie));

    expect(hiddenBody).toEqual(missingBody);
  });

  it('hides a job the collaborator is not assigned to', async () => {
    const collaborator = await memberCookie('collaborator');
    const job = await createJob();

    await notFoundBody(await getJob(job.id, collaborator.cookie));
  });

  it('answers 404 for a job of another workspace, even to its admin elsewhere', async () => {
    const otherWorkspace = await fixtures.workspace('Hải Đăng Labs');
    const foreign = await createJob({ workspaceId: otherWorkspace });
    const admin = await memberCookie('admin');

    const foreignBody = await notFoundBody(await getJob(foreign.id, admin.cookie));
    expect(foreignBody).toEqual(await notFoundBody(await getJob(randomUUID(), admin.cookie)));
  });

  it('answers 404 JOB_NOT_FOUND for an id that is not a uuid', async () => {
    const admin = await memberCookie('admin');

    const body = await notFoundBody(await getJob('not-a-uuid', admin.cookie));
    expect(body).toEqual(await notFoundBody(await getJob(randomUUID(), admin.cookie)));
  });

  it('answers 401 without a session', async () => {
    const job = await createJob();

    const response = await api.request(`/api/jobs/${job.id}`);

    expect(response.status).toBe(401);
  });
});
