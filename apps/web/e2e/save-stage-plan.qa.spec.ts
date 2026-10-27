// QA for issue #152: `PUT /api/jobs/:id/stages` against the Compose stack, sent from a signed-in
// browser through the web app's shared API client (`api.put` in lib/api.ts) and the Vite proxy, as
// the Quy trình tab's save bar will send it. The tab itself is a separate issue, so nothing is
// rendered here; this checks the rules behind the design's states grid (05-hiring-process): add,
// rename, reorder and retire in one save; restore back as the last active stage; the last active
// stage cannot be retired; retire targets must stay active; the plan must list exactly the job's
// stages; stale versions are refused ("Tải lại"); collaborators are read-only; hidden jobs are 404.
// Jobs and stages are seeded with SQL because there is no create-job endpoint yet.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const DEFAULT_STAGES = ['Mới', 'Sơ loại', 'Phỏng vấn', 'Đề nghị'];
const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

interface SeededJob {
  id: string;
  newStage: string;
  screening: string;
  interview: string;
  offer: string;
}

interface SaveStage {
  id?: string;
  tempId?: string;
  name: string;
  retired: boolean;
  retireTargetId?: string;
}

interface Stages {
  jobId: string;
  version: number;
  canEdit: boolean;
  active: { id: string; name: string; position: number }[];
  retired: { id: string; name: string; retiredAt: string }[];
}

/** One SQL query in the Compose Postgres, rows as tab-separated lines. */
function query(sql: string): string[] {
  const project = process.env.COMPOSE_PROJECT_NAME || 'ats';
  const output = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      '-p',
      project,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'ats',
      '-d',
      'ats',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
  return output.split('\n').filter((line) => line.length > 0);
}

/** Everything a save may change: the job's stage rows (by id) and its version. */
function snapshot(jobId: string) {
  return {
    stages: query(
      `select id, name, position, coalesce(retired_at::text, '') from job_stages
       where job_id = ${sqlString(jobId)} order by id`,
    ),
    version: query(`select version from jobs where id = ${sqlString(jobId)}`),
  };
}

/** A job as creation leaves it: four default stages at positions 1–4, version 1. */
function seedJob(
  workspaceId: string,
  email: string,
  options: { code?: string; accessScope?: string } = {},
): SeededJob {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, status, access_scope, created_by, owner_user_id, version)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, ${sqlString(options.code ?? 'AN-001')},
       'Product Designer', 'open', ${sqlString(options.accessScope ?? 'normal')}, id, id, 1
     from "user" where email = ${sqlString(email)}`,
  );
  const ids = DEFAULT_STAGES.map(() => randomUUID());
  const values = DEFAULT_STAGES.map(
    (name, index) =>
      `(${sqlString(ids[index]!)}, ${sqlString(id)}, ${sqlString(name)}, ${index + 1})`,
  );
  psql(`insert into job_stages (id, job_id, name, position) values ${values.join(', ')}`);
  return { id, newStage: ids[0]!, screening: ids[1]!, interview: ids[2]!, offer: ids[3]! };
}

function unchanged(job: SeededJob): SaveStage[] {
  return [
    { id: job.newStage, name: 'Mới', retired: false },
    { id: job.screening, name: 'Sơ loại', retired: false },
    { id: job.interview, name: 'Phỏng vấn', retired: false },
    { id: job.offer, name: 'Đề nghị', retired: false },
  ];
}

function joinWorkspace(workspaceId: string, email: string, role: string) {
  psql(
    `insert into member (id, organization_id, user_id, role, status)
     select ${sqlString(randomUUID())}, ${sqlString(workspaceId)}, id, ${sqlString(role)}, 'active'
     from "user" where email = ${sqlString(email)}`,
  );
  psql(
    `update session set active_organization_id = ${sqlString(workspaceId)}
     where user_id = (select id from "user" where email = ${sqlString(email)})`,
  );
}

async function memberPage(browser: Browser, workspaceId: string, email: string, role: string) {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const page = await context.newPage();
  await signInAsNewUser(page, email);
  joinWorkspace(workspaceId, email, role);
  return page;
}

type Result =
  { ok: true; data: Stages } | { ok: false; code?: string; status?: number; message?: string };

/** Sends the save through the web app's shared client in the page. */
async function saveStages(
  page: Page,
  id: string,
  body: { version: number; stages: SaveStage[] },
): Promise<Result> {
  return page.evaluate(
    async ([clientPath, jobId, payload]) => {
      const { api } = (await import(/* @vite-ignore */ clientPath)) as {
        api: { put: (path: string, body: unknown) => Promise<unknown> };
      };
      try {
        return {
          ok: true as const,
          data: (await api.put(`/jobs/${jobId}/stages`, payload)) as never,
        };
      } catch (error) {
        const e = error as { code?: string; status?: number; message?: string };
        return { ok: false as const, code: e.code, status: e.status, message: e.message };
      }
    },
    ['/src/lib/api.ts', id, body] as const,
  );
}

async function getStages(page: Page, id: string): Promise<Stages> {
  const response = await page.request.get(`/api/jobs/${id}/stages`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Stages;
}

/** An admin signed in with a new workspace and one seeded job. */
async function adminWithJob(page: Page, email: string) {
  await signInAsNewUser(page, email);
  const workspaceId = await createWorkspace(page, 'An Nhiên');
  return { workspaceId, job: seedJob(workspaceId, email) };
}

test.describe('save stage plan API (QA #152)', () => {
  test.use({ locale: 'vi-VN' });
  test.describe.configure({ timeout: 90_000 });

  test('adds "Portfolio review", renames Sơ loại and moves Đề nghị first; GET agrees, version + 1', async ({
    page,
  }, testInfo) => {
    const { job } = await adminWithJob(page, uniqueEmail(testInfo, 'qa152-edit'));

    const result = await saveStages(page, job.id, {
      version: 1,
      stages: [
        { id: job.offer, name: 'Đề nghị', retired: false },
        { id: job.newStage, name: 'Mới', retired: false },
        { id: job.screening, name: 'Phỏng vấn qua điện thoại', retired: false },
        { id: job.interview, name: 'Phỏng vấn', retired: false },
        { tempId: 'tmp-1', name: 'Portfolio review', retired: false },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.version).toBe(2);
    expect(result.data.canEdit).toBe(true);
    expect(result.data.retired).toEqual([]);
    expect(result.data.active.map(({ name, position }) => [name, position])).toEqual([
      ['Đề nghị', 1],
      ['Mới', 2],
      ['Phỏng vấn qua điện thoại', 3],
      ['Phỏng vấn', 4],
      ['Portfolio review', 5],
    ]);
    expect(result.data.active[2]!.id).toBe(job.screening);
    expect(result.data.active[4]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getStages(page, job.id)).toEqual(result.data);
  });

  test('retires Phỏng vấn into Đề nghị, then restores it as the last active stage', async ({
    page,
  }, testInfo) => {
    const { job } = await adminWithJob(page, uniqueEmail(testInfo, 'qa152-retire'));

    const retired = await saveStages(page, job.id, {
      version: 1,
      stages: [
        { id: job.newStage, name: 'Mới', retired: false },
        { id: job.screening, name: 'Sơ loại', retired: false },
        { id: job.offer, name: 'Đề nghị', retired: false },
        { id: job.interview, name: 'Phỏng vấn', retired: true, retireTargetId: job.offer },
      ],
    });
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    expect(retired.data.active.map((stage) => stage.name)).toEqual(['Mới', 'Sơ loại', 'Đề nghị']);
    expect(retired.data.retired).toHaveLength(1);
    expect(retired.data.retired[0]).toMatchObject({ id: job.interview, name: 'Phỏng vấn' });
    expect(Number.isNaN(Date.parse(retired.data.retired[0]!.retiredAt))).toBe(false);

    const restored = await saveStages(page, job.id, {
      version: retired.data.version,
      stages: [
        { id: job.newStage, name: 'Mới', retired: false },
        { id: job.screening, name: 'Sơ loại', retired: false },
        { id: job.offer, name: 'Đề nghị', retired: false },
        { id: job.interview, name: 'Phỏng vấn', retired: false },
      ],
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.data.version).toBe(3);
    expect(restored.data.retired).toEqual([]);
    expect(restored.data.active.map(({ id, position }) => [id, position])).toEqual([
      [job.newStage, 1],
      [job.screening, 2],
      [job.offer, 3],
      [job.interview, 4],
    ]);
  });

  test('refuses to retire every stage, a target retired in the same save, and incomplete or foreign plans; nothing changes', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa152-rules');
    const { workspaceId, job } = await adminWithJob(page, email);
    const other = seedJob(workspaceId, email, { code: 'AN-002' });
    const before = snapshot(job.id);

    const allRetired = await saveStages(page, job.id, {
      version: 1,
      stages: unchanged(job).map((stage) => ({ ...stage, retired: true })),
    });
    expect(allRetired).toMatchObject({
      ok: false,
      status: 422,
      code: 'STAGE_PLAN_NO_ACTIVE_STAGE',
    });

    const retiredTarget = await saveStages(page, job.id, {
      version: 1,
      stages: [
        { id: job.newStage, name: 'Mới', retired: false },
        { id: job.screening, name: 'Sơ loại', retired: false },
        { id: job.interview, name: 'Phỏng vấn', retired: true, retireTargetId: job.offer },
        { id: job.offer, name: 'Đề nghị', retired: true },
      ],
    });
    expect(retiredTarget).toMatchObject({
      ok: false,
      status: 422,
      code: 'STAGE_RETIRE_TARGET_INVALID',
    });

    const leftOut = await saveStages(page, job.id, {
      version: 1,
      stages: unchanged(job).slice(1),
    });
    expect(leftOut).toMatchObject({ ok: false, status: 422, code: 'STAGE_PLAN_INVALID' });

    const foreign = await saveStages(page, job.id, {
      version: 1,
      stages: [...unchanged(job), { id: other.offer, name: 'Đề nghị', retired: false }],
    });
    expect(foreign).toMatchObject({ ok: false, status: 422, code: 'STAGE_PLAN_INVALID' });

    expect(snapshot(job.id)).toEqual(before);
    expect(snapshot(other.id).version).toEqual(['1']);
  });

  test('a second save with the same version gets 409 JOB_VERSION_STALE', async ({
    page,
  }, testInfo) => {
    const { job } = await adminWithJob(page, uniqueEmail(testInfo, 'qa152-stale'));
    const renamed = unchanged(job);
    renamed[0] = { ...renamed[0]!, name: 'Ứng tuyển' };

    const first = await saveStages(page, job.id, { version: 1, stages: renamed });
    expect(first.ok).toBe(true);
    const after = snapshot(job.id);

    const second = await saveStages(page, job.id, { version: 1, stages: unchanged(job) });
    expect(second).toMatchObject({ ok: false, status: 409, code: 'JOB_VERSION_STALE' });
    expect(snapshot(job.id)).toEqual(after);
  });

  test('an assigned collaborator gets 403 FORBIDDEN; hidden, other-workspace and random jobs get one 404 body', async ({
    page,
    browser,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa152-access-admin');
    const { workspaceId, job } = await adminWithJob(page, adminEmail);
    const restricted = seedJob(workspaceId, adminEmail, {
      code: 'AN-002',
      accessScope: 'restricted',
    });
    const otherWorkspace = await createWorkspace(page, 'Hải Đăng Labs');
    const foreign = seedJob(otherWorkspace, adminEmail, { code: 'HD-001' });

    const collaboratorEmail = uniqueEmail(testInfo, 'qa152-access-collab');
    const collaborator = await memberPage(browser, workspaceId, collaboratorEmail, 'collaborator');
    psql(
      `insert into job_assignments (job_id, user_id)
       select ${sqlString(job.id)}, id from "user" where email = ${sqlString(collaboratorEmail)}`,
    );
    const before = snapshot(job.id);
    const asCollaborator = await saveStages(collaborator, job.id, {
      version: 1,
      stages: unchanged(job).reverse(),
    });
    expect(asCollaborator).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
    expect(snapshot(job.id)).toEqual(before);

    const recruiter = await memberPage(
      browser,
      workspaceId,
      uniqueEmail(testInfo, 'qa152-access-recruiter'),
      'recruiter',
    );
    const raw = async (id: string, stages: SaveStage[]) => {
      const response = await recruiter.request.put(`/api/jobs/${id}/stages`, {
        data: { version: 1, stages },
      });
      return { status: response.status(), body: await response.text() };
    };
    const missing = await raw(randomUUID(), unchanged(job));
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toMatchObject({ code: 'JOB_NOT_FOUND' });
    expect(await raw(restricted.id, unchanged(restricted))).toEqual(missing);
    expect(await raw(foreign.id, unchanged(foreign))).toEqual(missing);
    expect(snapshot(restricted.id).version).toEqual(['1']);
    expect(snapshot(foreign.id).version).toEqual(['1']);

    // The recruiter can edit the normal job.
    const asRecruiter = await saveStages(recruiter, job.id, {
      version: 1,
      stages: unchanged(job).reverse(),
    });
    expect(asRecruiter.ok && asRecruiter.data.active[0]!.name).toBe('Đề nghị');
  });
});
