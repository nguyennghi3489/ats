import { createHmac, randomUUID } from 'node:crypto';
import {
  DEFAULT_STAGE_NAMES,
  JOB_NOT_FOUND,
  type JobAccessScope,
  jobStagesSchema,
  type WorkspaceRole,
} from '@ats/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { JobAccessActor } from '../../src/access/jobs.access.js';
import { createDatabase, type Database } from '../../src/database/database.js';
import { jobAssignments, jobStages, jobs } from '../../src/database/schema.js';
import { StagesService } from '../../src/stages/stages.service.js';
import { accessFixtures } from '../access/fixtures.js';
import { type CountingDatabase, createCountingDatabase } from '../support/counting-database.js';
import { startTestApp, type TestApp } from '../support/test-app.js';
import { testDatabaseUrl } from '../support/test-database.js';

/** Better Auth's session cookie; the test app runs with secure cookies (any env but development). */
const SESSION_COOKIE = '__Secure-better-auth.session_token';
/** `betterAuthSecret` of the test app. */
const SECRET = 'test-only-better-auth-secret-0123456789abcdef';

describe('GET /api/jobs/:id/stages', () => {
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

  /**
   * A new job as job creation leaves it: the four default stages at positions 1–4. They are
   * inserted last-first so the response order cannot come from insertion order.
   */
  async function createJob(
    options: { accessScope?: JobAccessScope; workspaceId?: string; assign?: string[] } = {},
  ) {
    codeNumber += 1;
    const [job] = await database.db
      .insert(jobs)
      .values({
        workspaceId: options.workspaceId ?? workspaceId,
        code: `AN-${String(codeNumber).padStart(3, '0')}`,
        title: 'Product Designer',
        accessScope: options.accessScope ?? 'normal',
        ownerUserId: creatorId,
        createdBy: creatorId,
      })
      .returning({ id: jobs.id, version: jobs.version });
    if (!job) throw new Error('no job returned');
    const names = DEFAULT_STAGE_NAMES.vi;
    const stages = await database.db
      .insert(jobStages)
      .values(names.map((name, index) => ({ jobId: job.id, name, position: index + 1 })).reverse())
      .returning({ id: jobStages.id, name: jobStages.name, position: jobStages.position });
    for (const userId of options.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    return { id: job.id, version: job.version, stages };
  }

  function getStages(id: string, cookie: string) {
    return api.request(`/api/jobs/${id}/stages`, { headers: { cookie } });
  }

  async function notFoundBody(response: Response) {
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe(JOB_NOT_FOUND);
    return body;
  }

  it('returns a new job’s four active stages in order, no retired stage and its version', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    await database.db.update(jobs).set({ version: 7 }).where(eq(jobs.id, job.id));

    const response = await getStages(job.id, admin.cookie);

    expect(response.status).toBe(200);
    const body = jobStagesSchema.strict().parse(await response.json());
    const byPosition = [...job.stages].sort((a, b) => a.position - b.position);
    expect(body).toEqual({
      jobId: job.id,
      version: 7,
      canEdit: true,
      active: byPosition.map(({ id, name, position }) => ({ id, name, position })),
      retired: [],
    });
    expect(body.active.map((stage) => stage.name)).toEqual([
      'Mới',
      'Sơ loại',
      'Phỏng vấn',
      'Đề nghị',
    ]);
    expect(body.active.map((stage) => stage.position)).toEqual([1, 2, 3, 4]);
    for (const stage of body.active)
      expect(Object.keys(stage).sort()).toEqual(['id', 'name', 'position']);
  });

  it('lists a stage with retired_at only under retired, newest retirement first', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const screening = job.stages.find((stage) => stage.position === 2)!;
    const offer = job.stages.find((stage) => stage.position === 4)!;
    const older = new Date('2026-10-01T09:00:00.000Z');
    const newer = new Date('2026-10-20T08:30:00.000Z');
    await database.db.update(jobStages).set({ retiredAt: older }).where(eq(jobStages.id, offer.id));
    await database.db
      .update(jobStages)
      .set({ retiredAt: newer })
      .where(eq(jobStages.id, screening.id));

    const response = await getStages(job.id, admin.cookie);

    expect(response.status).toBe(200);
    const body = jobStagesSchema.parse(await response.json());
    expect(body.active.map((stage) => stage.name)).toEqual(['Mới', 'Phỏng vấn']);
    expect(body.retired).toEqual([
      { id: screening.id, name: 'Sơ loại', retiredAt: newer.toISOString() },
      { id: offer.id, name: 'Đề nghị', retiredAt: older.toISOString() },
    ]);
  });

  it('does not mix in the stages of another job', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    await createJob();

    const body = jobStagesSchema.parse(await (await getStages(job.id, admin.cookie)).json());

    expect(body.active.map((stage) => stage.id).sort()).toEqual(
      job.stages.map((stage) => stage.id).sort(),
    );
  });

  it('gives an admin and a recruiter canEdit: true, an assigned collaborator canEdit: false with the same stages', async () => {
    const admin = await memberCookie('admin');
    const recruiter = await memberCookie('recruiter');
    const collaborator = await memberCookie('collaborator');
    const job = await createJob({ assign: [collaborator.userId] });

    const adminBody = jobStagesSchema.parse(await (await getStages(job.id, admin.cookie)).json());
    const recruiterBody = jobStagesSchema.parse(
      await (await getStages(job.id, recruiter.cookie)).json(),
    );
    const collaboratorResponse = await getStages(job.id, collaborator.cookie);
    expect(collaboratorResponse.status).toBe(200);
    const collaboratorBody = jobStagesSchema.parse(await collaboratorResponse.json());

    expect(adminBody.canEdit).toBe(true);
    expect(recruiterBody.canEdit).toBe(true);
    expect(collaboratorBody.canEdit).toBe(false);
    expect(collaboratorBody).toEqual({ ...adminBody, canEdit: false });
    expect(recruiterBody).toEqual(adminBody);
  });

  it('answers a hidden job, another workspace’s job, a random uuid and a non-uuid with identical 404 bodies', async () => {
    const recruiter = await memberCookie('recruiter');
    const hidden = await createJob({ accessScope: 'restricted' });
    const otherWorkspace = await fixtures.workspace('Hải Đăng Labs');
    const foreign = await createJob({ workspaceId: otherWorkspace });

    const missing = await notFoundBody(await getStages(randomUUID(), recruiter.cookie));
    expect(await notFoundBody(await getStages(hidden.id, recruiter.cookie))).toEqual(missing);
    expect(await notFoundBody(await getStages(foreign.id, recruiter.cookie))).toEqual(missing);
    expect(await notFoundBody(await getStages('not-a-uuid', recruiter.cookie))).toEqual(missing);
  });

  it('hides a job the collaborator is not assigned to', async () => {
    const collaborator = await memberCookie('collaborator');
    const job = await createJob();

    await notFoundBody(await getStages(job.id, collaborator.cookie));
  });

  it('answers 401 without a session', async () => {
    const job = await createJob();

    const response = await api.request(`/api/jobs/${job.id}/stages`);

    expect(response.status).toBe(401);
  });

  describe('SQL statements', () => {
    let counting: CountingDatabase;

    beforeAll(() => {
      counting = createCountingDatabase();
    });

    afterAll(async () => {
      await counting.close();
    });

    it('reads the job and its stages with at most two statements', async () => {
      const { id } = await fixtures.user();
      await fixtures.member(workspaceId, id, 'recruiter');
      const job = await createJob({ accessScope: 'restricted', assign: [id] });
      await database.db
        .update(jobStages)
        .set({ retiredAt: new Date() })
        .where(eq(jobStages.id, job.stages[0]!.id));
      const actor: JobAccessActor = { user: { id }, workspaceId, role: 'recruiter' };
      const service = new StagesService({ db: counting.db } as unknown as Database);

      counting.reset();
      const stages = await service.find(actor, job.id);

      expect(stages?.active).toHaveLength(3);
      expect(stages?.retired).toHaveLength(1);
      expect(counting.queries).toBeLessThanOrEqual(2);
    });

    it('stops after one statement when the job is hidden, and sends none for a non-uuid', async () => {
      const { id } = await fixtures.user();
      await fixtures.member(workspaceId, id, 'recruiter');
      const hidden = await createJob({ accessScope: 'restricted' });
      const actor: JobAccessActor = { user: { id }, workspaceId, role: 'recruiter' };
      const service = new StagesService({ db: counting.db } as unknown as Database);

      counting.reset();
      expect(await service.find(actor, hidden.id)).toBeNull();
      expect(counting.queries).toBe(1);

      counting.reset();
      expect(await service.find(actor, 'not-a-uuid')).toBeNull();
      expect(counting.queries).toBe(0);
    });
  });
});
