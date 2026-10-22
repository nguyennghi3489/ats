// QA for issue #115 (workspace menu), on top of workspace-menu.spec.ts, against the Compose stack:
// - the trigger is disabled and busy while the switch request runs, and the menu is closed;
// - nothing of the previous workspace stays on screen: switching from an admin workspace to one
//   where the user is a collaborator swaps the sidebar items and role, and the new workspace list
//   is read from the API after the switch, before /jobs renders;
// - switching while already on /jobs still lands on /jobs in the new workspace;
// - vi first, then the same flows in English (switch, WORKSPACE_UNAVAILABLE notice, heading);
// - the trigger keeps the visible heading uppercased like the design.
// Screenshots of the open menu in vi and en are attached to the test results for the report.
import { expect, type Page, test } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { createWorkspace, psql, signInAsNewUser, sqlString, uniqueEmail } from './support/session';

type Locale = 'vi' | 'en';
const COPY = { vi, en } as const;

async function seed(
  page: Page,
  email: string,
  names: readonly string[],
  locale: Locale,
): Promise<string[]> {
  await signInAsNewUser(page, email, locale);
  psql(`update "user" set name = 'Minh Anh' where email = ${sqlString(email)}`);
  const ids: string[] = [];
  for (const name of names) ids.push(await createWorkspace(page, name));
  const response = await page.request.put('/api/workspaces/active', {
    data: { workspaceId: ids[0] },
  });
  expect(response.status()).toBe(200);
  await page.goto('/jobs');
  await expect(trigger(page)).toContainText(names[0]!);
  return ids;
}

const trigger = (page: Page) => page.getByTestId('workspace-menu-trigger');
const menu = (page: Page) => page.getByRole('menu');
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name });
const navLinks = (page: Page, locale: Locale) =>
  page
    .getByTestId('app-sidebar')
    .getByRole('navigation', { name: COPY[locale].shell.nav.label })
    .getByRole('link');

async function activeWorkspaceId(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/workspaces');
  return ((await response.json()) as { activeWorkspaceId: string | null }).activeWorkspaceId;
}

for (const locale of ['vi', 'en'] as const) {
  const copy = COPY[locale];
  const nav = copy.shell.nav;

  test.describe(`workspace menu QA (${locale})`, () => {
    test.use({
      locale: locale === 'vi' ? 'vi-VN' : 'en-US',
      viewport: { width: 1440, height: 900 },
    });

    test('disables the trigger while the switch runs, then lands on /jobs', async ({
      page,
    }, testInfo) => {
      const ids = await seed(
        page,
        uniqueEmail(testInfo, `qa115q-busy-${locale}`),
        ['An Nhiên', 'Mây Studio'],
        locale,
      );
      await page.goto('/applications');
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/workspaces/active', async (route) => {
        await held;
        await route.continue();
      });

      await trigger(page).click();
      await item(page, 'Mây Studio').click();

      await expect(menu(page)).toHaveCount(0);
      await expect(trigger(page)).toBeDisabled();
      await expect(trigger(page)).toHaveAttribute('aria-busy', 'true');
      await expect(page).toHaveURL(/\/applications$/);

      release();
      await expect(page).toHaveURL(/\/jobs$/);
      await expect(trigger(page)).toBeEnabled();
      await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');
      expect(await activeWorkspaceId(page)).toBe(ids[1]);
    });

    test('leaves nothing of the previous workspace: role and sidebar follow the new one', async ({
      page,
    }, testInfo) => {
      const email = uniqueEmail(testInfo, `qa115q-role-${locale}`);
      const ids = await seed(page, email, ['An Nhiên', 'Mây Studio'], locale);
      // In Mây Studio the user is only a collaborator.
      psql(
        `update member set role = 'collaborator'
         where organization_id = ${sqlString(ids[1]!)}
           and user_id = (select id from "user" where email = ${sqlString(email)})`,
      );
      await page.reload();
      await expect(navLinks(page, locale)).toHaveText([
        nav.applications,
        nav.candidates,
        nav.jobs,
        nav.workspaceSettings,
      ]);
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(copy.shell.roles.admin);

      // Order on the wire: the switch, then a fresh workspace list for the new workspace.
      const calls: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/workspaces')) calls.push(`${request.method()} ${path}`);
      });

      await trigger(page).click();
      await item(page, 'Mây Studio').click();

      await expect(page).toHaveURL(/\/jobs$/);
      await expect(page.getByTestId('workspace-menu-name')).toHaveText('Mây Studio');
      await expect(navLinks(page, locale)).toHaveText([nav.myApplications, nav.myJobs]);
      await expect(page.getByTestId('app-sidebar-user-role')).toHaveText(
        copy.shell.roles.collaborator,
      );
      await expect(page.getByTestId('app-sidebar')).not.toContainText(nav.workspaceSettings);
      expect(calls.slice(0, 2)).toEqual(['PUT /api/workspaces/active', 'GET /api/workspaces']);
      expect(await activeWorkspaceId(page)).toBe(ids[1]);
    });

    test('switching while already on /jobs stays on /jobs in the new workspace', async ({
      page,
    }, testInfo) => {
      const ids = await seed(
        page,
        uniqueEmail(testInfo, `qa115q-onjobs-${locale}`),
        ['An Nhiên', 'Hải Đăng Labs'],
        locale,
      );
      await expect(page).toHaveURL(/\/jobs$/);

      await trigger(page).click();
      await item(page, 'Hải Đăng Labs').click();

      await expect(page.getByTestId('workspace-menu-name')).toHaveText('Hải Đăng Labs');
      await expect(page.getByTestId('workspace-menu-initial')).toHaveText('H');
      await expect(page).toHaveURL(/\/jobs$/);
      expect(await activeWorkspaceId(page)).toBe(ids[1]);
    });

    test('WORKSPACE_UNAVAILABLE shows the translated notice and keeps the workspace', async ({
      page,
    }, testInfo) => {
      const email = uniqueEmail(testInfo, `qa115q-gone-${locale}`);
      const ids = await seed(page, email, ['An Nhiên', 'Mây Studio'], locale);
      await trigger(page).click();
      psql(
        `delete from member
         where organization_id = ${sqlString(ids[1]!)}
           and user_id = (select id from "user" where email = ${sqlString(email)})`,
      );
      await item(page, 'Mây Studio').click();

      const notice = page.getByTestId('workspace-menu-error');
      await expect(notice).toHaveText(copy.shell.workspaceMenu.unavailable);
      // Under the trigger, inside the sidebar.
      const noticeBox = (await notice.boundingBox())!;
      const triggerBox = (await trigger(page).boundingBox())!;
      expect(noticeBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
      await expect(page.getByTestId('workspace-menu-name')).toHaveText('An Nhiên');
      await expect(trigger(page)).toBeEnabled();
      expect(await activeWorkspaceId(page)).toBe(ids[0]);

      await trigger(page).click();
      await expect(menu(page).getByRole('menuitem')).toHaveText(['An Nhiên']);
    });

    test('open menu copy and layout, with a screenshot for the report', async ({
      page,
    }, testInfo) => {
      await seed(
        page,
        uniqueEmail(testInfo, `qa115q-look-${locale}`),
        ['An Nhiên', 'Mây Studio', 'Hải Đăng Labs'],
        locale,
      );
      await expect(trigger(page)).toHaveAccessibleName(
        copy.shell.workspaceMenu.trigger.replace('{name}', 'An Nhiên'),
      );
      await trigger(page).click();
      await expect(menu(page)).toBeVisible();
      // Design: the heading is drawn in capitals ("KHÔNG GIAN LÀM VIỆC").
      const heading = menu(page).getByText(copy.shell.workspaceMenu.heading, { exact: true });
      await expect(heading).toHaveCSS('text-transform', 'uppercase');
      // Opens below the trigger, left-aligned with it.
      const menuBox = (await menu(page).boundingBox())!;
      const triggerBox = (await trigger(page).boundingBox())!;
      expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
      expect(Math.abs(menuBox.x - triggerBox.x)).toBeLessThanOrEqual(1);
      // The trigger spans the sidebar's content width.
      expect(triggerBox.width).toBeGreaterThan(180);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(1439, 899);
      await testInfo.attach(`workspace-menu-open-${locale}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await page.screenshot({ path: testInfo.outputPath(`workspace-menu-open-${locale}.png`) });
    });
  });
}
