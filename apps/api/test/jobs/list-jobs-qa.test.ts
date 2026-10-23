import { randomUUID } from 'node:crypto';
import {
  type JobAccessScope,
  type JobListQuery,
  jobListResponseSchema,
  type JobListResponse,
  type JobStatus,
  type WorkspaceRole,
} from '@ats/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { JobAccessActor } from '../../src/access/index.js';
import { member, user } from '../../src/auth/auth.schema.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobs } from '../../src/database/schema.js';
import { JobsListService } from '../../src/jobs/jobs-list.service.js';
import { accessFixtures } from '../access/fixtures.js';
import { type CountingDatabase, createCountingDatabase } from '../support/counting-database.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

// QA for #126: visibility, paging and search edges of GET /api/jobs beyond the branch's own tests.

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

describe('GET /api/jobs (QA)', () => {
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

  async function signedInAs(role: WorkspaceRole | null, inWorkspace: string | null = workspaceId) {
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
    if (role !== null && inWorkspace !== null) {
      await fixtures.member(inWorkspace, userId, role);
      await database.db.execute(
        sql`update "session" set active_organization_id = ${inWorkspace} where user_id = ${userId}`,
      );
    }
    return { userId, cookie: cookie?.split(';')[0] ?? '' };
  }

  async function createJob(input: JobInput = {}): Promise<string> {
    codeNumber += 1;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId: input.workspaceId ?? workspaceId,
        code: input.code ?? `QA-${String(codeNumber).padStart(3, '0')}`,
        title: input.title ?? `Vị trí ${codeNumber}`,
        status: input.status ?? 'open',
        accessScope: input.accessScope ?? 'normal',
        ownerUserId: input.ownerUserId ?? null,
        createdBy: creatorId,
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
    expect(response.status, query).toBe(200);
    return jobListResponseSchema.parse(await response.json());
  }

  const ids = (page: JobListResponse) => page.items.map((job) => job.id);

  it('shows an admin restricted jobs they are not assigned to, and counts them', async () => {
    const admin = await signedInAs('admin');
    const normal = await createJob();
    const restricted = await createJob({ accessScope: 'restricted' });

    const page = await list(admin.cookie);
    expect(ids(page)).toEqual([restricted, normal]);
    expect(page.total).toBe(2);
  });

  it('pages a recruiter by visible jobs only when hidden jobs are interleaved', async () => {
    const recruiter = await signedInAs('recruiter');
    const visible: string[] = [];
    const hidden: string[] = [];
    for (let index = 0; index < 32; index += 1) {
      // Every sixth job is restricted and not assigned: 27 visible, 5 hidden, mixed by date.
      if (index % 6 === 5) hidden.push(await createJob({ accessScope: 'restricted' }));
      else visible.push(await createJob());
    }
    const newestFirst = [...visible].reverse();

    const first = await list(recruiter.cookie);
    expect(first).toMatchObject({ total: 27, page: 1, pageSize: 25 });
    expect(ids(first)).toEqual(newestFirst.slice(0, 25));

    const second = await list(recruiter.cookie, '?page=2');
    expect(second).toMatchObject({ total: 27, page: 2 });
    expect(ids(second)).toEqual(newestFirst.slice(25));

    for (const id of hidden) expect([...ids(first), ...ids(second)]).not.toContain(id);
  });

  it('does not reveal a hidden job through the search or the Closed filter', async () => {
    const recruiter = await signedInAs('recruiter');
    await createJob({ title: 'Giám đốc tài chính', code: 'QA-900', accessScope: 'restricted' });
    await createJob({ title: 'Kế toán trưởng', status: 'closed', accessScope: 'restricted' });
    const other = await fixtures.workspace('Khác');
    await createJob({ workspaceId: other, title: 'Giám đốc tài chính', code: 'QA-901' });
    await createJob({ workspaceId: other, status: 'closed', code: 'QA-902' });

    for (const query of [
      '?q=giam%20doc',
      '?q=qa-90',
      '?status=closed',
      '?q=ke%20toan&status=closed',
    ]) {
      expect(await list(recruiter.cookie, query), query).toMatchObject({ items: [], total: 0 });
    }
  });

  it('shows a collaborator only assigned Closed jobs through the filter', async () => {
    const collaborator = await signedInAs('collaborator');
    const assignedClosed = await createJob({ status: 'closed', assign: [collaborator.userId] });
    await createJob({ status: 'closed' });
    await createJob({ status: 'open', assign: [collaborator.userId] });

    const page = await list(collaborator.cookie, '?status=closed');
    expect(ids(page)).toEqual([assignedClosed]);
    expect(page.total).toBe(1);
  });

  it('matches đ and upper-case Vietnamese without accents, and partial codes', async () => {
    const admin = await signedInAs('admin');
    const graphic = await createJob({ title: 'Thiết kế đồ hoạ', code: 'AN-001' });
    const accountant = await createJob({ title: 'Kế toán', code: 'AN-002' });

    for (const q of ['do hoa', 'ĐỒ HOẠ', 'Đồ Hoạ', 'THIET KE DO']) {
      expect(ids(await list(admin.cookie, `?q=${encodeURIComponent(q)}`)), q).toEqual([graphic]);
    }
    expect(ids(await list(admin.cookie, '?q=002'))).toEqual([accountant]);
    expect(ids(await list(admin.cookie, '?q=AN-'))).toEqual([accountant, graphic]);
  });

  it('returns owner null when the owner user has been deleted', async () => {
    const admin = await signedInAs('admin');
    const owner = await fixtures.user();
    const job = await createJob({ ownerUserId: owner.id });
    await database.db.delete(user).where(eq(user.id, owner.id));

    expect((await list(admin.cookie)).items).toEqual([
      { id: job, code: 'QA-001', title: 'Vị trí 1', status: 'open', owner: null },
    ]);
  });

  it('ignores unknown query parameters and keeps the page size at 25', async () => {
    const admin = await signedInAs('admin');
    for (let index = 0; index < 26; index += 1) await createJob();

    const page = await list(admin.cookie, '?pageSize=100&limit=100&sort=title');
    expect(page).toMatchObject({ total: 26, page: 1, pageSize: 25 });
    expect(page.items).toHaveLength(25);
  });

  it('answers 400 VALIDATION_FAILED for a status in the wrong case or an empty status', async () => {
    const admin = await signedInAs('admin');
    for (const query of ['?status=CLOSED', '?status=', '?page=1.5', '?page=-1']) {
      const response = await get(admin.cookie, query);
      expect(response.status, query).toBe(400);
      expect(await response.json(), query).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('answers 403 WORKSPACE_REQUIRED to a signed-in user with no active workspace', async () => {
    const lone = await signedInAs(null, null);
    const response = await get(lone.cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'WORKSPACE_REQUIRED' });
  });

  it('answers 403 WORKSPACE_ACCESS_REVOKED once the membership is deactivated', async () => {
    const recruiter = await signedInAs('recruiter');
    await createJob();
    await database.db
      .update(member)
      .set({ status: 'deactivated' })
      .where(eq(member.userId, recruiter.userId));

    const response = await get(recruiter.cookie);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'WORKSPACE_ACCESS_REVOKED' });
  });

  describe('SQL statements', () => {
    let counting: CountingDatabase;

    beforeAll(() => {
      counting = createCountingDatabase();
    });

    afterAll(async () => {
      await counting.close();
    });

    it('lists with at most two statements for every role, filter, search and page', async () => {
      const ownerless = await fixtures.user();
      await fixtures.member(workspaceId, ownerless.id, 'collaborator');
      for (let index = 0; index < 30; index += 1) {
        await createJob({
          ownerUserId: creatorId,
          status: index % 4 === 0 ? 'closed' : 'open',
          accessScope: index % 3 === 0 ? 'restricted' : 'normal',
          assign: index % 2 === 0 ? [ownerless.id] : [],
        });
      }
      const service = new JobsListService({ db: counting.db } as unknown as Database);

      const queries: JobListQuery[] = [
        { q: undefined, status: 'active', page: 1 },
        { q: undefined, status: 'closed', page: 1 },
        { q: 'vi tri', status: 'active', page: 2 },
      ];
      for (const role of ['admin', 'recruiter', 'collaborator'] as const) {
        for (const query of queries) {
          const actor: JobAccessActor = { user: { id: ownerless.id }, workspaceId, role };
          counting.reset();
          await service.list(actor, query);
          expect(counting.queries, `${role} ${JSON.stringify(query)}`).toBeLessThanOrEqual(2);
        }
      }
    });
  });
});
