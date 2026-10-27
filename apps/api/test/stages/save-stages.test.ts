import { createHmac, randomUUID } from 'node:crypto';
import {
  DEFAULT_STAGE_NAMES,
  FORBIDDEN,
  JOB_NOT_FOUND,
  JOB_VERSION_STALE,
  type JobAccessScope,
  type JobStages,
  jobStagesSchema,
  STAGE_NAME_INVALID,
  STAGE_PLAN_INVALID,
  STAGE_PLAN_NO_ACTIVE_STAGE,
  STAGE_RETIRE_TARGET_INVALID,
  type StagePlanSave,
  type WorkspaceRole,
} from '@ats/shared';
import { asc, eq, sql } from 'drizzle-orm';
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

type SaveStage = StagePlanSave['stages'][number];

describe('PUT /api/jobs/:id/stages', () => {
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

  /** A job with the four default English stages at positions 1–4, version 1. */
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
    const rows = await database.db
      .insert(jobStages)
      .values(
        DEFAULT_STAGE_NAMES.en.map((name, index) => ({ jobId: job.id, name, position: index + 1 })),
      )
      .returning({ id: jobStages.id, name: jobStages.name });
    for (const userId of options.assign ?? []) {
      await database.db.insert(jobAssignments).values({ jobId: job.id, userId });
    }
    const byName = (name: string) => rows.find((row) => row.name === name)!.id;
    return {
      id: job.id,
      version: job.version,
      newStage: byName('New'),
      screening: byName('Screening'),
      interview: byName('Interview'),
      offer: byName('Offer'),
    };
  }

  type Job = Awaited<ReturnType<typeof createJob>>;

  /** The job's four stages unchanged, in order, as save entries. */
  function unchanged(job: Job): SaveStage[] {
    return [
      { id: job.newStage, name: 'New', retired: false },
      { id: job.screening, name: 'Screening', retired: false },
      { id: job.interview, name: 'Interview', retired: false },
      { id: job.offer, name: 'Offer', retired: false },
    ];
  }

  function save(id: string, cookie: string, body: unknown) {
    return api.request(`/api/jobs/${id}/stages`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function getStages(id: string, cookie: string): Promise<JobStages> {
    const response = await api.request(`/api/jobs/${id}/stages`, { headers: { cookie } });
    expect(response.status).toBe(200);
    return jobStagesSchema.parse(await response.json());
  }

  async function errorBody(response: Response, status: number) {
    expect(response.status).toBe(status);
    return (await response.json()) as { code: string; message: string };
  }

  /** Everything the save may change: the stage rows and the job's version. */
  async function snapshot(jobId: string) {
    const stages = await database.db
      .select()
      .from(jobStages)
      .where(eq(jobStages.jobId, jobId))
      .orderBy(asc(jobStages.id));
    const [job] = await database.db
      .select({ version: jobs.version })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    return { stages, version: job!.version };
  }

  it('adds, renames and reorders in one save; GET shows the result and version + 1', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const response = await save(job.id, admin.cookie, {
      version: job.version,
      stages: [
        { id: job.offer, name: 'Offer', retired: false },
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: '  Phone screen ', retired: false },
        { id: job.interview, name: 'Interview', retired: false },
        { tempId: 'tmp-1', name: 'Portfolio review', retired: false },
      ],
    });

    expect(response.status).toBe(200);
    const body = jobStagesSchema.strict().parse(await response.json());
    expect(body.jobId).toBe(job.id);
    expect(body.version).toBe(job.version + 1);
    expect(body.canEdit).toBe(true);
    expect(body.retired).toEqual([]);
    expect(body.active.map(({ name, position }) => [name, position])).toEqual([
      ['Offer', 1],
      ['New', 2],
      ['Phone screen', 3],
      ['Interview', 4],
      ['Portfolio review', 5],
    ]);
    expect(body.active[2]!.id).toBe(job.screening);
    expect(body.active[0]!.id).toBe(job.offer);
    expect(Object.values(job)).not.toContain(body.active[4]!.id);

    expect(await getStages(job.id, admin.cookie)).toEqual(body);
  });

  it('lets a recruiter save a normal job', async () => {
    const recruiter = await memberCookie('recruiter');
    const job = await createJob();

    const response = await save(job.id, recruiter.cookie, {
      version: job.version,
      stages: unchanged(job).reverse(),
    });

    expect(response.status).toBe(200);
    const body = jobStagesSchema.parse(await response.json());
    expect(body.active.map((stage) => stage.name)).toEqual([
      'Offer',
      'Interview',
      'Screening',
      'New',
    ]);
  });

  it('retires a stage with a target, then restores it as the last active stage', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const retiredResponse = await save(job.id, admin.cookie, {
      version: job.version,
      stages: [
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: 'Screening', retired: false },
        { id: job.offer, name: 'Offer', retired: false },
        { id: job.interview, name: 'Interview', retired: true, retireTargetId: job.offer },
      ],
    });

    expect(retiredResponse.status).toBe(200);
    const retired = jobStagesSchema.parse(await retiredResponse.json());
    expect(retired.active.map(({ id, position }) => [id, position])).toEqual([
      [job.newStage, 1],
      [job.screening, 2],
      [job.offer, 3],
    ]);
    expect(retired.retired).toHaveLength(1);
    expect(retired.retired[0]).toMatchObject({ id: job.interview, name: 'Interview' });
    expect(Date.now() - Date.parse(retired.retired[0]!.retiredAt)).toBeLessThan(60_000);

    const restoredResponse = await save(job.id, admin.cookie, {
      version: retired.version,
      stages: [
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: 'Screening', retired: false },
        { id: job.offer, name: 'Offer', retired: false },
        { id: job.interview, name: 'Interview', retired: false },
      ],
    });

    expect(restoredResponse.status).toBe(200);
    const restored = jobStagesSchema.parse(await restoredResponse.json());
    expect(restored.version).toBe(job.version + 2);
    expect(restored.retired).toEqual([]);
    expect(restored.active.map(({ id, position }) => [id, position])).toEqual([
      [job.newStage, 1],
      [job.screening, 2],
      [job.offer, 3],
      [job.interview, 4],
    ]);
    const [row] = await database.db
      .select({ retiredAt: jobStages.retiredAt })
      .from(jobStages)
      .where(eq(jobStages.id, job.interview));
    expect(row!.retiredAt).toBeNull();
  });

  it('keeps the retired_at of a stage that stays retired', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const earlier = new Date('2026-10-01T09:00:00.000Z');
    await database.db
      .update(jobStages)
      .set({ retiredAt: earlier })
      .where(eq(jobStages.id, job.interview));

    const response = await save(job.id, admin.cookie, {
      version: job.version,
      stages: [
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: 'Screening', retired: false },
        { id: job.offer, name: 'Offer', retired: false },
        { id: job.interview, name: 'Interview round', retired: true },
      ],
    });

    expect(response.status).toBe(200);
    const body = jobStagesSchema.parse(await response.json());
    expect(body.retired).toEqual([
      { id: job.interview, name: 'Interview round', retiredAt: earlier.toISOString() },
    ]);
  });

  it('rejects retiring every stage with 422 STAGE_PLAN_NO_ACTIVE_STAGE and changes nothing', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const before = await snapshot(job.id);

    const response = await save(job.id, admin.cookie, {
      version: job.version,
      stages: unchanged(job).map((stage) => ({ ...stage, retired: true })),
    });

    expect((await errorBody(response, 422)).code).toBe(STAGE_PLAN_NO_ACTIVE_STAGE);
    expect(await snapshot(job.id)).toEqual(before);
  });

  it('rejects a retire target retired in the same request with 422 STAGE_RETIRE_TARGET_INVALID', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const before = await snapshot(job.id);

    const response = await save(job.id, admin.cookie, {
      version: job.version,
      stages: [
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: 'Screening', retired: false },
        { id: job.interview, name: 'Interview', retired: true, retireTargetId: job.offer },
        { id: job.offer, name: 'Offer', retired: true },
      ],
    });

    expect((await errorBody(response, 422)).code).toBe(STAGE_RETIRE_TARGET_INVALID);
    expect(await snapshot(job.id)).toEqual(before);
  });

  it('accepts a new stage of the same request as retire target', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const response = await save(job.id, admin.cookie, {
      version: job.version,
      stages: [
        { id: job.newStage, name: 'New', retired: false },
        { id: job.screening, name: 'Screening', retired: false },
        { id: job.offer, name: 'Offer', retired: false },
        { tempId: 'tmp-1', name: 'Tech interview', retired: false },
        { id: job.interview, name: 'Interview', retired: true, retireTargetId: 'tmp-1' },
      ],
    });

    expect(response.status).toBe(200);
    const body = jobStagesSchema.parse(await response.json());
    expect(body.active.map((stage) => stage.name)).toEqual([
      'New',
      'Screening',
      'Offer',
      'Tech interview',
    ]);
  });

  it('rejects a blank stage name with 422 STAGE_NAME_INVALID', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const stages = unchanged(job);
    stages[1] = { ...stages[1]!, name: '   ' };

    const response = await save(job.id, admin.cookie, { version: job.version, stages });

    expect((await errorBody(response, 422)).code).toBe(STAGE_NAME_INVALID);
  });

  it('answers 400 VALIDATION_FAILED for a malformed body', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const response = await save(job.id, admin.cookie, { version: 'one', stages: [] });

    expect((await errorBody(response, 400)).code).toBe('VALIDATION_FAILED');
  });

  describe('422 STAGE_PLAN_INVALID', () => {
    it('when an existing stage is left out', async () => {
      const admin = await memberCookie('admin');
      const job = await createJob();
      const before = await snapshot(job.id);

      const response = await save(job.id, admin.cookie, {
        version: job.version,
        stages: unchanged(job).slice(0, 3),
      });

      expect((await errorBody(response, 422)).code).toBe(STAGE_PLAN_INVALID);
      expect(await snapshot(job.id)).toEqual(before);
    });

    it('when a stage id belongs to another job', async () => {
      const admin = await memberCookie('admin');
      const job = await createJob();
      const other = await createJob();
      const before = await snapshot(job.id);

      const response = await save(job.id, admin.cookie, {
        version: job.version,
        stages: [...unchanged(job), { id: other.offer, name: 'Offer', retired: false }],
      });

      expect((await errorBody(response, 422)).code).toBe(STAGE_PLAN_INVALID);
      expect(await snapshot(job.id)).toEqual(before);
      expect((await snapshot(other.id)).version).toBe(other.version);
    });

    it('when a stage is listed twice, or a tempId repeats', async () => {
      const admin = await memberCookie('admin');
      const job = await createJob();

      const twice = await save(job.id, admin.cookie, {
        version: job.version,
        stages: [...unchanged(job), { id: job.offer, name: 'Offer', retired: false }],
      });
      expect((await errorBody(twice, 422)).code).toBe(STAGE_PLAN_INVALID);

      const tempTwice = await save(job.id, admin.cookie, {
        version: job.version,
        stages: [
          ...unchanged(job),
          { tempId: 'tmp-1', name: 'A', retired: false },
          { tempId: 'tmp-1', name: 'B', retired: false },
        ],
      });
      expect((await errorBody(tempTwice, 422)).code).toBe(STAGE_PLAN_INVALID);
    });

    it('when a stage id is not a uuid', async () => {
      const admin = await memberCookie('admin');
      const job = await createJob();

      const response = await save(job.id, admin.cookie, {
        version: job.version,
        stages: [...unchanged(job), { id: 'not-a-uuid', name: 'X', retired: false }],
      });

      expect((await errorBody(response, 422)).code).toBe(STAGE_PLAN_INVALID);
    });
  });

  it('answers the second of two saves with the same version 409 JOB_VERSION_STALE', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();
    const stages = unchanged(job);
    stages[0] = { ...stages[0]!, name: 'Applied' };

    const first = await save(job.id, admin.cookie, { version: job.version, stages });
    expect(first.status).toBe(200);
    const after = await snapshot(job.id);

    const second = await save(job.id, admin.cookie, {
      version: job.version,
      stages: unchanged(job),
    });

    expect((await errorBody(second, 409)).code).toBe(JOB_VERSION_STALE);
    expect(await snapshot(job.id)).toEqual(after);
  });

  it('serialises two concurrent saves with the same version: one wins, one is stale', async () => {
    const admin = await memberCookie('admin');
    const job = await createJob();

    const responses = await Promise.all([
      save(job.id, admin.cookie, { version: job.version, stages: unchanged(job) }),
      save(job.id, admin.cookie, { version: job.version, stages: unchanged(job).reverse() }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await snapshot(job.id)).version).toBe(job.version + 1);
  });

  it('answers an assigned collaborator 403 FORBIDDEN and changes nothing', async () => {
    const collaborator = await memberCookie('collaborator');
    const job = await createJob({ assign: [collaborator.userId] });
    const before = await snapshot(job.id);

    const response = await save(job.id, collaborator.cookie, {
      version: job.version,
      stages: unchanged(job).reverse(),
    });

    expect((await errorBody(response, 403)).code).toBe(FORBIDDEN);
    expect(await snapshot(job.id)).toEqual(before);
  });

  it('answers a hidden job, another workspace’s job, a random uuid and a non-uuid with identical 404 bodies', async () => {
    const recruiter = await memberCookie('recruiter');
    const hidden = await createJob({ accessScope: 'restricted' });
    const otherWorkspace = await fixtures.workspace('Hải Đăng Labs');
    const foreign = await createJob({ workspaceId: otherWorkspace });
    const hiddenBefore = await snapshot(hidden.id);
    const foreignBefore = await snapshot(foreign.id);

    const missing = await errorBody(
      await save(randomUUID(), recruiter.cookie, { version: 1, stages: unchanged(hidden) }),
      404,
    );
    expect(missing.code).toBe(JOB_NOT_FOUND);
    const hiddenBody = await errorBody(
      await save(hidden.id, recruiter.cookie, { version: 1, stages: unchanged(hidden) }),
      404,
    );
    const foreignBody = await errorBody(
      await save(foreign.id, recruiter.cookie, { version: 1, stages: unchanged(foreign) }),
      404,
    );
    const nonUuid = await errorBody(
      await save('not-a-uuid', recruiter.cookie, { version: 1, stages: unchanged(hidden) }),
      404,
    );

    expect(hiddenBody).toEqual(missing);
    expect(foreignBody).toEqual(missing);
    expect(nonUuid).toEqual(missing);
    expect(await snapshot(hidden.id)).toEqual(hiddenBefore);
    expect(await snapshot(foreign.id)).toEqual(foreignBefore);
  });

  it('answers 401 without a session', async () => {
    const job = await createJob();

    const response = await api.request(`/api/jobs/${job.id}/stages`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, stages: unchanged(job) }),
    });

    expect(response.status).toBe(401);
  });

  describe('a failure after some writes', () => {
    afterAll(async () => {
      await database.db.execute(sql`drop trigger if exists save_stages_test_fail on jobs`);
      await database.db.execute(sql`drop function if exists save_stages_test_fail()`);
    });

    it('rolls back every stage write when the version update fails', async () => {
      const admin = await memberCookie('admin');
      const job = await createJob();
      const before = await snapshot(job.id);
      // Fails the version update of this one job only, after the stage writes have run.
      await database.db.execute(
        sql.raw(`create or replace function save_stages_test_fail() returns trigger as $$
          begin
            if new.id = '${job.id}' and new.version <> old.version then
              raise exception 'forced failure';
            end if;
            return new;
          end $$ language plpgsql`),
      );
      await database.db.execute(
        sql`create or replace trigger save_stages_test_fail before update on jobs for each row execute function save_stages_test_fail()`,
      );

      const response = await save(job.id, admin.cookie, {
        version: job.version,
        stages: [
          { id: job.offer, name: 'Offer', retired: false },
          { id: job.newStage, name: 'Applied', retired: false },
          { id: job.screening, name: 'Screening', retired: true, retireTargetId: job.offer },
          { id: job.interview, name: 'Interview', retired: false },
          { tempId: 'tmp-1', name: 'Portfolio review', retired: false },
        ],
      });

      expect(response.status).toBe(500);
      expect(await snapshot(job.id)).toEqual(before);
    });
  });
});
