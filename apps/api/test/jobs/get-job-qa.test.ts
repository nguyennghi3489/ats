import { createHmac, randomUUID } from 'node:crypto';
import { JOB_NOT_FOUND, jobHeaderSchema, type WorkspaceRole } from '@ats/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { accessFixtures } from '../access/fixtures.js';
import { startTestApp, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

// QA for #129: edges of GET /api/jobs/:id beyond the branch's own tests.

const SESSION_COOKIE = '__Secure-better-auth.session_token';
const SECRET = 'test-only-better-auth-secret-0123456789abcdef';

describe('GET /api/jobs/:id (QA)', () => {
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

  async function cookieFor(userId: string, activeWorkspaceId: string) {
    const token = await fixtures.session(userId, { activeWorkspaceId });
    const signature = createHmac('sha256', SECRET).update(token).digest('base64');
    return `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
  }

  async function createJob(workspaceId: string, createdBy: string, accessScope = 'normal') {
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId,
        code: 'AN-001',
        title: 'Product Designer',
        accessScope: accessScope as 'normal' | 'restricted',
        ownerUserId: createdBy,
        createdBy,
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error('no job returned');
    return job.id;
  }

  async function memberOf(workspaceId: string, role: WorkspaceRole) {
    const { id } = await fixtures.user();
    await fixtures.member(workspaceId, id, role);
    return id;
  }

  const get = (id: string, cookie: string) =>
    api.request(`/api/jobs/${id}`, { headers: { cookie } });

  it("answers 404 for a job of the caller's other workspace while another one is active", async () => {
    const first = await fixtures.workspace('An Nhiên');
    const second = await fixtures.workspace('Hải Đăng Labs');
    const adminId = await memberOf(first, 'admin');
    await fixtures.member(second, adminId, 'admin');
    const jobInFirst = await createJob(first, adminId);

    const activeSecond = await cookieFor(adminId, second);
    const foreign = await get(jobInFirst, activeSecond);
    const missing = await get(randomUUID(), activeSecond);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());

    // The same job is visible once its own workspace is the active one.
    const activeFirst = await cookieFor(adminId, first);
    const own = await get(jobInFirst, activeFirst);
    expect(own.status).toBe(200);
    expect(jobHeaderSchema.parse(await own.json()).canEdit).toBe(true);
  });

  it('gives an admin a restricted job nobody assigned them to, with canEdit: true', async () => {
    const workspaceId = await fixtures.workspace();
    const creator = await memberOf(workspaceId, 'admin');
    const admin = await memberOf(workspaceId, 'admin');
    const jobId = await createJob(workspaceId, creator, 'restricted');

    const response = await get(jobId, await cookieFor(admin, workspaceId));

    expect(response.status).toBe(200);
    expect(jobHeaderSchema.parse(await response.json())).toMatchObject({
      accessScope: 'restricted',
      canEdit: true,
    });
  });

  it('hides a restricted job from an unassigned collaborator, and shows it once assigned', async () => {
    const workspaceId = await fixtures.workspace();
    const creator = await memberOf(workspaceId, 'admin');
    const collaborator = await memberOf(workspaceId, 'collaborator');
    const jobId = await createJob(workspaceId, creator, 'restricted');
    const cookie = await cookieFor(collaborator, workspaceId);

    const hidden = await get(jobId, cookie);
    expect(hidden.status).toBe(404);
    expect(((await hidden.json()) as { code: string }).code).toBe(JOB_NOT_FOUND);

    await database.db.insert(jobAssignments).values({ jobId, userId: collaborator });
    const shown = await get(jobId, cookie);
    expect(shown.status).toBe(200);
    expect(jobHeaderSchema.parse(await shown.json()).canEdit).toBe(false);
  });

  it('answers the same 404 for odd ids: sql-ish text, a too-long uuid and the nil uuid', async () => {
    const workspaceId = await fixtures.workspace();
    const admin = await memberOf(workspaceId, 'admin');
    const cookie = await cookieFor(admin, workspaceId);
    const baseline = await (await get(randomUUID(), cookie)).json();

    for (const id of [
      "1'%20or%20'1'%3D'1",
      `${randomUUID()}0`,
      '00000000-0000-0000-0000-000000000000',
    ]) {
      const response = await get(id, cookie);
      expect(response.status, id).toBe(404);
      expect(await response.json(), id).toEqual(baseline);
    }
  });
});
