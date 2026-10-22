import { randomUUID } from 'node:crypto';
import { Controller, Get, Inject, Param, Put } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Actor,
  canEditJob,
  findVisibleJob,
  forbidden,
  jobNotFound,
  visibleJobsFilter,
  type WorkspaceActor,
} from '../../src/access/index.js';
import { user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { DATABASE } from '../../src/database/database.module.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';
import { accessFixtures } from './fixtures.js';

const PASSWORD = 'correct-horse-battery-staple';

/**
 * QA probe for #124: the way a jobs route is meant to use the access module, behind the real
 * global guard and Nest's exception layer, so the 404 / 403 bodies are checked as the client sees
 * them.
 */
@Controller('test/jobs-probe')
class JobsProbeController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Get()
  async list(@Actor() actor: WorkspaceActor) {
    const rows = await this.database.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(visibleJobsFilter(actor));
    const [total] = await this.database.db
      .select({ value: count() })
      .from(jobs)
      .where(visibleJobsFilter(actor));
    return { ids: rows.map((row) => row.id), total: total?.value ?? 0 };
  }

  @Get(':id')
  async show(@Actor() actor: WorkspaceActor, @Param('id') id: string) {
    const job = await findVisibleJob(this.database.db, actor, id);
    if (!job) throw jobNotFound();
    return { id: job.id };
  }

  @Put(':id')
  async edit(@Actor() actor: WorkspaceActor, @Param('id') id: string) {
    const job = await findVisibleJob(this.database.db, actor, id);
    if (!job) throw jobNotFound();
    if (!canEditJob(actor, job)) throw forbidden();
    return { id: job.id, edited: true };
  }
}

describe('QA #124: job rules as a jobs route uses them, over HTTP', () => {
  let api: TestApp;
  let database: Database;
  let fixtures: ReturnType<typeof accessFixtures>;

  beforeAll(async () => {
    api = await startTestApp({}, { controllers: [JobsProbeController] });
    database = createDatabase({ url: testDatabaseUrl(), max: 1 });
    fixtures = accessFixtures(database.db);
  });

  afterAll(async () => {
    await api.close();
    await database.close();
  });

  let workspaceId: string;
  let otherWorkspaceId: string;
  let creatorId: string;
  let codeNumber: number;

  beforeEach(async () => {
    workspaceId = await fixtures.workspace();
    otherWorkspaceId = await fixtures.workspace('Biển Xanh');
    creatorId = (await fixtures.user()).id;
    await fixtures.member(workspaceId, creatorId, 'admin');
    await fixtures.member(otherWorkspaceId, creatorId, 'admin');
    codeNumber = 0;
  });

  function post(path: string, body: unknown) {
    return api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
      body: JSON.stringify(body),
    });
  }

  /** A real signed-in user (Better Auth), member of `workspaceId` with `role`, active there. */
  async function signedInAs(role: WorkspaceActor['role'], inWorkspace = workspaceId) {
    const email = `${randomUUID()}@example.test`;
    expect(
      (await post('/api/auth/sign-up/email', { name: 'Lan', email, password: PASSWORD })).status,
    ).toBe(200);
    await database.db.execute(sql`update "user" set email_verified = true where email = ${email}`);
    const signIn = await post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((value) => /session_token=/.test(value));
    const [row] = await database.db.select({ id: user.id }).from(user).where(eq(user.email, email));
    const userId = row?.id ?? '';
    await fixtures.member(inWorkspace, userId, role);
    await database.db.execute(
      sql`update "session" set active_organization_id = ${inWorkspace} where user_id = ${userId}`,
    );
    return { userId, cookie: cookie?.split(';')[0] ?? '' };
  }

  async function createJob(
    accessScope: 'normal' | 'restricted',
    options: { workspaceId?: string; assign?: string[] } = {},
  ) {
    codeNumber += 1;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId: options.workspaceId ?? workspaceId,
        code: `MS-${String(codeNumber).padStart(3, '0')}`,
        title: `Chuyên viên ${codeNumber}`,
        accessScope,
        createdBy: creatorId,
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error('no job returned');
    for (const userId of options.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return job.id;
  }

  const get = (path: string, cookie: string) => api.request(path, { headers: { cookie } });
  const put = (path: string, cookie: string) =>
    api.request(path, { method: 'PUT', headers: { cookie, origin: TEST_WEB_ORIGIN } });

  it('answers a hidden job, a random uuid and a malformed id with the same 404 body', async () => {
    const recruiter = await signedInAs('recruiter');
    const hidden = await createJob('restricted');
    const foreign = await createJob('normal', { workspaceId: otherWorkspaceId });

    const responses = await Promise.all(
      [hidden, foreign, randomUUID(), 'not-a-uuid'].map((id) =>
        get(`/test/jobs-probe/${id}`, recruiter.cookie),
      ),
    );
    const answers = await Promise.all(
      responses.map(async (response) => ({ status: response.status, body: await response.text() })),
    );
    expect(answers[0]?.status).toBe(404);
    expect(JSON.parse(answers[0]?.body ?? '{}')).toMatchObject({ code: 'JOB_NOT_FOUND' });
    for (const answer of answers) expect(answer).toEqual(answers[0]);
  });

  it('answers a collaborator editing an assigned job with 403 FORBIDDEN, and an unassigned one with 404', async () => {
    const collaborator = await signedInAs('collaborator');
    const assigned = await createJob('normal', { assign: [collaborator.userId] });
    const unassigned = await createJob('normal');

    expect((await get(`/test/jobs-probe/${assigned}`, collaborator.cookie)).status).toBe(200);
    const edit = await put(`/test/jobs-probe/${assigned}`, collaborator.cookie);
    expect(edit.status).toBe(403);
    expect(await edit.json()).toMatchObject({ code: 'FORBIDDEN' });

    const hiddenEdit = await put(`/test/jobs-probe/${unassigned}`, collaborator.cookie);
    expect(hiddenEdit.status).toBe(404);
    expect(await hiddenEdit.json()).toMatchObject({ code: 'JOB_NOT_FOUND' });
  });

  it('lets a recruiter edit a normal job and an assigned restricted one', async () => {
    const recruiter = await signedInAs('recruiter');
    const normal = await createJob('normal');
    const restricted = await createJob('restricted', { assign: [recruiter.userId] });

    expect((await put(`/test/jobs-probe/${normal}`, recruiter.cookie)).status).toBe(200);
    expect((await put(`/test/jobs-probe/${restricted}`, recruiter.cookie)).status).toBe(200);
  });

  it('keeps hidden jobs out of the list and its count (no leak through totals)', async () => {
    const recruiter = await signedInAs('recruiter');
    const normal = await createJob('normal');
    await createJob('restricted');
    await createJob('normal', { workspaceId: otherWorkspaceId, assign: [recruiter.userId] });

    const response = await get('/test/jobs-probe', recruiter.cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ids: [normal], total: 1 });
  });

  it('does not carry an assignment in one workspace over to a role in another', async () => {
    // Recruiter in this workspace, but assigned to a restricted job of the other workspace
    // (where they are also a collaborator).
    const recruiter = await signedInAs('recruiter');
    await fixtures.member(otherWorkspaceId, recruiter.userId, 'collaborator');
    const foreignRestricted = await createJob('restricted', {
      workspaceId: otherWorkspaceId,
      assign: [recruiter.userId],
    });

    expect((await get(`/test/jobs-probe/${foreignRestricted}`, recruiter.cookie)).status).toBe(404);
    expect(await (await get('/test/jobs-probe', recruiter.cookie)).json()).toEqual({
      ids: [],
      total: 0,
    });
  });

  it("does not let another user's assignment reveal a restricted job to a recruiter", async () => {
    const recruiter = await signedInAs('recruiter');
    const colleague = await signedInAs('recruiter');
    const restricted = await createJob('restricted', { assign: [colleague.userId] });

    expect((await get(`/test/jobs-probe/${restricted}`, recruiter.cookie)).status).toBe(404);
    expect((await get(`/test/jobs-probe/${restricted}`, colleague.cookie)).status).toBe(200);
    const [row] = await database.db
      .select({ value: count() })
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, restricted));
    expect(row?.value).toBe(1);
  });
});
