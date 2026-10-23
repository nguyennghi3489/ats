import { randomUUID } from 'node:crypto';
import {
  type JobAccessScope,
  jobListResponseSchema,
  type JobListResponse,
  type JobStatus,
  type WorkspaceRole,
} from '@ats/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { JobAccessActor } from '../../src/access/index.js';
import { user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { JobsListService } from '../../src/jobs/jobs-list.service.js';
import { accessFixtures } from '../access/fixtures.js';
import { type CountingDatabase, createCountingDatabase } from '../support/counting-database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

const PASSWORD = 'correct-horse-battery-staple';

interface JobInput {
  title?: string;
  code?: string;
  status?: JobStatus;
  accessScope?: JobAccessScope;
  ownerUserId?: string | null;
  assign?: string[];
  workspaceId?: string;
}

describe('GET /api/jobs', () => {
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
    workspaceId = await fixtures.workspace();
    creatorId = (await fixtures.user()).id;
    await fixtures.member(workspaceId, creatorId, 'admin');
    codeNumber = 0;
  });

  /** A real signed-in user (Better Auth), member of `workspaceId` with `role`, active there. */
  async function signedInAs(role: WorkspaceRole, inWorkspace = workspaceId) {
    const email = `${randomUUID()}@example.test`;
    const post = (path: string, body: unknown) =>
      api.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
        body: JSON.stringify(body),
      });
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

  async function createJob(input: JobInput = {}): Promise<string> {
    codeNumber += 1;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId: input.workspaceId ?? workspaceId,
        code: input.code ?? `MS-${String(codeNumber).padStart(3, '0')}`,
        title: input.title ?? `Chuyên viên ${codeNumber}`,
        status: input.status ?? 'open',
        accessScope: input.accessScope ?? 'normal',
        ownerUserId: input.ownerUserId ?? null,
        createdBy: creatorId,
        // Strictly increasing, so "newest first" is deterministic.
        createdAt: new Date(Date.UTC(2026, 0, 1) + codeNumber * 60_000),
      })
      .returning({ id: jobs.id });
    if (!job) throw new Error('no job returned');
    for (const userId of input.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return job.id;
  }

  function get(cookie: string, query = '') {
    return api.request(`/api/jobs${query}`, { headers: { cookie } });
  }

  async function list(cookie: string, query = ''): Promise<JobListResponse> {
    const response = await get(cookie, query);
    expect(response.status).toBe(200);
    return jobListResponseSchema.parse(await response.json());
  }

  it('lists Draft, Open and Paused jobs by default and Closed ones only through the filter', async () => {
    const admin = await signedInAs('admin');
    const draft = await createJob({ status: 'draft' });
    const open = await createJob({ status: 'open' });
    const paused = await createJob({ status: 'paused' });
    const closed = await createJob({ status: 'closed' });

    const active = await list(admin.cookie);
    expect(active.items.map((job) => job.id)).toEqual([paused, open, draft]);
    expect(active).toMatchObject({ total: 3, page: 1, pageSize: 25 });
    expect(await list(admin.cookie, '?status=active')).toEqual(active);

    const onlyClosed = await list(admin.cookie, '?status=closed');
    expect(onlyClosed.items.map((job) => job.id)).toEqual([closed]);
    expect(onlyClosed.total).toBe(1);

    expect((await list(admin.cookie, '?status=paused')).items.map((job) => job.id)).toEqual([
      paused,
    ]);
  });

  it('returns each job as a summary with its owner, a deactivated owner keeping their name', async () => {
    const admin = await signedInAs('admin');
    const owner = await fixtures.user();
    await database.db.update(user).set({ name: 'Minh Trần' }).where(eq(user.id, owner.id));
    await fixtures.member(workspaceId, owner.id, 'recruiter', 'deactivated');
    const owned = await createJob({ title: 'Kế toán', ownerUserId: owner.id, status: 'draft' });
    const unowned = await createJob({ title: 'Lập trình viên' });

    const page = await list(admin.cookie);

    expect(page.items).toEqual([
      { id: unowned, code: 'MS-002', title: 'Lập trình viên', status: 'open', owner: null },
      {
        id: owned,
        code: 'MS-001',
        title: 'Kế toán',
        status: 'draft',
        owner: { id: owner.id, name: 'Minh Trần' },
      },
    ]);
  });

  it('orders jobs created at the same time by code, newest code first', async () => {
    const admin = await signedInAs('admin');
    const first = await createJob();
    const second = await createJob();
    await database.db.update(jobs).set({ createdAt: new Date(Date.UTC(2026, 0, 1)) });

    expect((await list(admin.cookie)).items.map((job) => job.id)).toEqual([second, first]);
  });

  it('searches title and code without accents or case', async () => {
    const admin = await signedInAs('admin');
    const designer = await createJob({ title: 'Thiết kế sản phẩm', code: 'AN-001' });
    const analyst = await createJob({ title: 'Chuyên viên phân tích', code: 'AN-002' });
    await createJob({ title: 'Kế toán', code: 'AN-003' });

    const byTitle = await list(admin.cookie, `?q=${encodeURIComponent('thiet ke')}`);
    expect(byTitle.items.map((job) => job.id)).toEqual([designer]);
    expect(byTitle.total).toBe(1);

    expect((await list(admin.cookie, '?q=an-002')).items.map((job) => job.id)).toEqual([analyst]);
    expect(
      (await list(admin.cookie, `?q=${encodeURIComponent('  THIẾT  ')}`)).items.map((j) => j.id),
    ).toEqual([designer]);
    expect((await list(admin.cookie, '?q=%20%20')).total).toBe(3);
  });

  it('treats % and _ in the search as plain characters', async () => {
    const admin = await signedInAs('admin');
    const discount = await createJob({ title: 'Giảm 50% phí' });
    await createJob({ title: 'Kế toán' });

    expect((await list(admin.cookie, '?q=%25')).items.map((job) => job.id)).toEqual([discount]);
    expect((await list(admin.cookie, '?q=_')).total).toBe(0);
  });

  it('combines the search with the status filter', async () => {
    const admin = await signedInAs('admin');
    await createJob({ title: 'Thiết kế đồ hoạ', status: 'open' });
    const closed = await createJob({ title: 'Thiết kế nội thất', status: 'closed' });

    const page = await list(admin.cookie, '?q=thiet&status=closed');
    expect(page.items.map((job) => job.id)).toEqual([closed]);
    expect(page.total).toBe(1);
  });

  it('pages 25 jobs at a time', async () => {
    const admin = await signedInAs('admin');
    const ids: string[] = [];
    for (let index = 0; index < 30; index += 1) ids.push(await createJob());
    const newestFirst = [...ids].reverse();

    const first = await list(admin.cookie);
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 25 });
    expect(first.items.map((job) => job.id)).toEqual(newestFirst.slice(0, 25));

    const second = await list(admin.cookie, '?page=2');
    expect(second).toMatchObject({ total: 30, page: 2, pageSize: 25 });
    expect(second.items.map((job) => job.id)).toEqual(newestFirst.slice(25));

    const beyond = await list(admin.cookie, '?page=3');
    expect(beyond).toMatchObject({ items: [], total: 30, page: 3 });
  });

  it("does not count restricted jobs a recruiter is not assigned to, nor other workspaces' jobs", async () => {
    const recruiter = await signedInAs('recruiter');
    const normal = await createJob({ accessScope: 'normal' });
    const assigned = await createJob({ accessScope: 'restricted', assign: [recruiter.userId] });
    await createJob({ accessScope: 'restricted' });
    const otherWorkspace = await fixtures.workspace('Khác');
    await createJob({ workspaceId: otherWorkspace, code: 'MS-900' });

    const page = await list(recruiter.cookie);
    expect(page.items.map((job) => job.id)).toEqual([assigned, normal]);
    expect(page.total).toBe(2);
  });

  it('shows a collaborator only the jobs assigned to them', async () => {
    const collaborator = await signedInAs('collaborator');
    await createJob({ accessScope: 'normal' });
    const assignedNormal = await createJob({
      accessScope: 'normal',
      assign: [collaborator.userId],
    });
    const assignedRestricted = await createJob({
      accessScope: 'restricted',
      assign: [collaborator.userId],
    });
    await createJob({ accessScope: 'restricted' });

    const page = await list(collaborator.cookie);
    expect(page.items.map((job) => job.id)).toEqual([assignedRestricted, assignedNormal]);
    expect(page.total).toBe(2);
  });

  it('answers 400 VALIDATION_FAILED for an invalid status, page or search', async () => {
    const admin = await signedInAs('admin');
    for (const query of [
      '?status=archived',
      '?status=open&status=paused',
      '?page=0',
      '?page=abc',
      `?q=${'a'.repeat(201)}`,
    ]) {
      const response = await get(admin.cookie, query);
      expect(response.status, query).toBe(400);
      expect(await response.json(), query).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('answers 401 UNAUTHENTICATED without a session', async () => {
    const response = await api.request('/api/jobs');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  describe('SQL statements', () => {
    let counting: CountingDatabase;

    beforeAll(() => {
      counting = createCountingDatabase();
    });

    afterAll(async () => {
      await counting.close();
    });

    it('lists a page with at most two statements', async () => {
      const { id } = await fixtures.user();
      await fixtures.member(workspaceId, id, 'recruiter');
      for (let index = 0; index < 3; index += 1) await createJob({ ownerUserId: creatorId });
      await createJob({ accessScope: 'restricted', assign: [id] });
      const actor: JobAccessActor = { user: { id }, workspaceId, role: 'recruiter' };
      const service = new JobsListService({ db: counting.db } as unknown as Database);

      counting.reset();
      const page = await service.list(actor, { q: 'chuyen', status: 'active', page: 1 });

      expect(page.total).toBe(4);
      expect(counting.queries).toBeLessThanOrEqual(2);
    });
  });
});
