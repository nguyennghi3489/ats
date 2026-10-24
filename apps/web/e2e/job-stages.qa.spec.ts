// QA for issue #139: `GET /api/jobs/:id/stages` against the Compose stack, called from a signed-in
// browser through the web app's own typed client (`getJobStages` in features/stages/stages.api.ts)
// and the Vite proxy. The Quy trình tab UI is a separate issue, so nothing is rendered here; this
// checks the data the tab will load: four active stages in position order with the job's version,
// retired stages listed apart (newest first), canEdit per role, and one identical 404 for a
// missing, hidden, other-workspace and non-uuid job. Jobs and stages are seeded with SQL because
// there is no create-job endpoint yet.
import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

const DEFAULT_STAGES = ['Mới', 'Sơ loại', 'Phỏng vấn', 'Đề nghị'];

interface SeededJob {
  id: string;
  stageIds: string[];
}

/**
 * A job as creation leaves it: four default stages at positions 1–4, inserted last-first so the
 * response order cannot come from insertion order.
 */
function seedJob(
  workspaceId: string,
  email: string,
  options: { code?: string; accessScope?: string; version?: number } = {},
): SeededJob {
  const id = randomUUID();
  psql(
    `insert into jobs (id, workspace_id, code, title, status, access_scope, created_by, owner_user_id, version)
     select ${sqlString(id)}, ${sqlString(workspaceId)}, ${sqlString(options.code ?? 'AN-001')},
       'Product Designer', 'draft', ${sqlString(options.accessScope ?? 'normal')}, id, id,
       ${options.version ?? 1}
     from "user" where email = ${sqlString(email)}`,
  );
  const stageIds = DEFAULT_STAGES.map(() => randomUUID());
  const values = DEFAULT_STAGES.map(
    (name, index) =>
      `(${sqlString(stageIds[index]!)}, ${sqlString(id)}, ${sqlString(name)}, ${index + 1})`,
  ).reverse();
  psql(`insert into job_stages (id, job_id, name, position) values ${values.join(', ')}`);
  return { id, stageIds };
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

function assign(jobId: string, email: string) {
  psql(
    `insert into job_assignments (job_id, user_id)
     select ${sqlString(jobId)}, id from "user" where email = ${sqlString(email)}`,
  );
}

/** Calls the web app's `getJobStages` in the page; returns the parsed data or the ApiError. */
async function getJobStages(page: Page, id: string) {
  return page.evaluate(
    async ([clientPath, jobId]) => {
      const { getJobStages: get } = (await import(/* @vite-ignore */ clientPath)) as {
        getJobStages: (i: string) => Promise<unknown>;
      };
      try {
        return { ok: true as const, data: await get(jobId) };
      } catch (error) {
        const e = error as { code?: string; status?: number };
        return { ok: false as const, code: e.code, status: e.status };
      }
    },
    ['/src/features/stages/stages.api.ts', id] as const,
  );
}

/** The raw HTTP answer, for comparing 404 bodies byte for byte. */
async function rawStages(page: Page, id: string) {
  const response = await page.request.get(`/api/jobs/${id}/stages`);
  return { status: response.status(), body: await response.text() };
}

async function memberPage(browser: Browser, workspaceId: string, email: string, role: string) {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const page = await context.newPage();
  await signInAsNewUser(page, email);
  joinWorkspace(workspaceId, email, role);
  return page;
}

test.describe('job stages API (QA #139)', () => {
  test.use({ locale: 'vi-VN' });

  test('a new job returns four active stages in order, no retired stage and its version', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa139-new');
    await signInAsNewUser(page, email);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const job = seedJob(workspaceId, email, { version: 5 });

    const result = await getJobStages(page, job.id);

    expect(result).toEqual({
      ok: true,
      data: {
        jobId: job.id,
        version: 5,
        canEdit: true,
        active: DEFAULT_STAGES.map((name, index) => ({
          id: job.stageIds[index],
          name,
          position: index + 1,
        })),
        retired: [],
      },
    });
  });

  test('a stage with retired_at appears only under retired, newest first', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa139-retired');
    await signInAsNewUser(page, email);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const job = seedJob(workspaceId, email);
    const [, screening, , offer] = job.stageIds;
    psql(
      `update job_stages set retired_at = '2026-10-01T09:00:00Z' where id = ${sqlString(offer!)}`,
    );
    psql(
      `update job_stages set retired_at = '2026-10-20T08:30:00Z' where id = ${sqlString(screening!)}`,
    );

    const result = await getJobStages(page, job.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as {
      active: { id: string; name: string; position: number }[];
      retired: { id: string; name: string; retiredAt: string }[];
    };
    expect(data.active.map((stage) => stage.name)).toEqual(['Mới', 'Phỏng vấn']);
    expect(data.active.map((stage) => stage.id)).not.toContain(screening);
    expect(data.active.map((stage) => stage.id)).not.toContain(offer);
    expect(data.retired).toEqual([
      { id: screening, name: 'Sơ loại', retiredAt: '2026-10-20T08:30:00.000Z' },
      { id: offer, name: 'Đề nghị', retiredAt: '2026-10-01T09:00:00.000Z' },
    ]);
  });

  test('admin and recruiter get canEdit true, an assigned collaborator canEdit false with the same stages', async ({
    page,
    browser,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa139-admin');
    await signInAsNewUser(page, adminEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const job = seedJob(workspaceId, adminEmail);

    const recruiterEmail = uniqueEmail(testInfo, 'qa139-recruiter');
    const recruiter = await memberPage(browser, workspaceId, recruiterEmail, 'recruiter');
    const collaboratorEmail = uniqueEmail(testInfo, 'qa139-collab');
    const collaborator = await memberPage(browser, workspaceId, collaboratorEmail, 'collaborator');
    assign(job.id, collaboratorEmail);

    const admin = await getJobStages(page, job.id);
    const asRecruiter = await getJobStages(recruiter, job.id);
    const asCollaborator = await getJobStages(collaborator, job.id);

    expect(admin.ok && (admin.data as { canEdit: boolean }).canEdit).toBe(true);
    expect(asRecruiter).toEqual(admin);
    expect(asCollaborator.ok).toBe(true);
    expect(asCollaborator).toEqual({
      ok: true,
      data: { ...(admin.ok ? (admin.data as object) : {}), canEdit: false },
    });
  });

  test('hidden, other-workspace, random and non-uuid jobs all answer the same 404 JOB_NOT_FOUND', async ({
    page,
    browser,
  }, testInfo) => {
    const adminEmail = uniqueEmail(testInfo, 'qa139-404-admin');
    await signInAsNewUser(page, adminEmail);
    const workspaceId = await createWorkspace(page, 'An Nhiên');
    const restricted = seedJob(workspaceId, adminEmail, { accessScope: 'restricted' });
    const otherWorkspace = await createWorkspace(page, 'Hải Đăng Labs');
    const foreign = seedJob(otherWorkspace, adminEmail, { code: 'HD-001' });

    const recruiterEmail = uniqueEmail(testInfo, 'qa139-404-recruiter');
    const recruiter = await memberPage(browser, workspaceId, recruiterEmail, 'recruiter');

    const missing = await rawStages(recruiter, randomUUID());
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toMatchObject({ code: 'JOB_NOT_FOUND' });
    for (const id of [restricted.id, foreign.id, 'not-a-uuid']) {
      expect(await rawStages(recruiter, id), id).toEqual(missing);
    }
    // The typed client surfaces the same error.
    expect(await getJobStages(recruiter, 'not-a-uuid')).toEqual({
      ok: false,
      code: 'JOB_NOT_FOUND',
      status: 404,
    });
  });
});
