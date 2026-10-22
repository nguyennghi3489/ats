import type { MeUser } from '@ats/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { registerWorkspaceCache } from '../features/workspaces/workspace-cache';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import { i18n, setLocale } from '../i18n';
import { createAppRouter, installRouteGuards } from '../router';

const user: MeUser = {
  id: 'user-1',
  name: 'Minh Anh',
  email: 'minh.anh@example.test',
  locale: 'vi',
  emailVerified: true,
};

const anNhien = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };
const may = { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'recruiter' };
const haiDang = { id: 'org_3', name: 'Hải Đăng Labs', codePrefix: 'HD', role: 'collaborator' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const pathOf = (r: Request) => new URL(r.url, 'http://localhost').pathname;

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let pinia: Pinia;
let router: Router;
let uninstall: () => void;
/** What `GET /api/me` answers; its locale becomes the app's. */
let meUser: MeUser;
/** The server side: the workspaces of the user and the session's active one. */
let serverList: { activeWorkspaceId: string | null; workspaces: unknown[] };
/** What `PUT /api/workspaces/active` answers; by default it switches like the API. */
let switchAnswer: ((workspaceId: string) => Response | Promise<Response>) | null;
/** Everything that happened, in order: `select`, `clear`, `navigate:<path>`. */
let events: string[];
const cleanups: Array<() => void> = [];

function requests(method: string, path: string): Request[] {
  return fetchFn.mock.calls
    .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
    .filter((r) => r.method === method && pathOf(r) === path);
}

beforeEach(() => {
  setLocale('vi');
  meUser = user;
  serverList = { activeWorkspaceId: 'org_1', workspaces: [anNhien, may, haiDang] };
  switchAnswer = null;
  events = [];
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = pathOf(request);
    if (path === '/api/me') return jsonResponse({ user: meUser });
    if (path === '/api/workspaces' && request.method === 'GET') {
      return jsonResponse(serverList);
    }
    if (path === '/api/workspaces/active' && request.method === 'PUT') {
      const { workspaceId } = (await request.json()) as { workspaceId: string };
      events.push('select');
      if (switchAnswer) return switchAnswer(workspaceId);
      const workspace = serverList.workspaces.find(
        (candidate) => (candidate as { id: string }).id === workspaceId,
      );
      if (!workspace) return jsonResponse({ code: 'WORKSPACE_UNAVAILABLE' }, 404);
      serverList = { ...serverList, activeWorkspaceId: workspaceId };
      return jsonResponse(workspace);
    }
    return jsonResponse({ code: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  setActivePinia(pinia);
  router = createAppRouter(createMemoryHistory(), false);
  uninstall = installRouteGuards(router, pinia);
  cleanups.push(registerWorkspaceCache(() => events.push('clear')));
  cleanups.push(
    router.beforeEach((to) => {
      events.push(`navigate:${to.fullPath}`);
    }),
  );
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  while (cleanups.length > 0) cleanups.pop()!();
  uninstall();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const mounted: VueWrapper[] = [];

/** The whole app at `path`: the app layout with the workspace menu on top of its sidebar. */
async function mountApp(path = '/candidates') {
  await router.push(path);
  await router.isReady();
  const Root = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(Root, {
    global: { plugins: [router, pinia, i18n] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await vi.waitFor(() =>
    expect(wrapper.find('[data-testid="workspace-menu-trigger"]').exists()).toBe(true),
  );
  await flushPromises();
  events = [];
  return wrapper;
}

function trigger() {
  const el = document.querySelector<HTMLButtonElement>('[data-testid="workspace-menu-trigger"]');
  if (!el) throw new Error('no workspace menu trigger');
  return el;
}

function menu() {
  return document.querySelector<HTMLElement>('[role="menu"]');
}

function items() {
  return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
}

function key(el: HTMLElement, name: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

async function openMenu() {
  trigger().click();
  await flushPromises();
  expect(menu()).not.toBeNull();
}

describe('WorkspaceMenu', () => {
  it('shows the active workspace initial and name on the trigger', async () => {
    await mountApp();

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().querySelector('[data-testid="workspace-menu-initial"]')?.textContent).toBe(
      'A',
    );
    expect(trigger().querySelector('[data-testid="workspace-menu-name"]')?.textContent).toBe(
      'An Nhiên',
    );
    expect(document.querySelector('[data-testid="app-sidebar"]')?.contains(trigger())).toBe(true);
  });

  it('lists every workspace in API order under the heading, with a check on the active one', async () => {
    await mountApp();
    await openMenu();

    expect(menu()!.textContent).toContain('Không gian làm việc');
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      'An Nhiên',
      'Mây Studio',
      'Hải Đăng Labs',
    ]);
    const current = items().filter((item) => item.getAttribute('aria-current') === 'true');
    expect(current.map((item) => item.textContent?.trim())).toEqual(['An Nhiên']);
    expect(current[0]!.classList.contains('workspace-menu__item--active')).toBe(true);
    expect(items()[1]!.classList.contains('workspace-menu__item--active')).toBe(false);
  });

  it('switches: select, then clear the cache, then go to /jobs with the new workspace', async () => {
    await mountApp();
    await openMenu();

    items()[1]!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/jobs'));
    await flushPromises();

    expect(events).toEqual(['select', 'clear', 'navigate:/jobs']);
    expect(requests('PUT', '/api/workspaces/active')).toHaveLength(1);
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_2');
    expect(trigger().querySelector('[data-testid="workspace-menu-name"]')?.textContent).toBe(
      'Mây Studio',
    );
    expect(trigger().querySelector('[data-testid="workspace-menu-initial"]')?.textContent).toBe(
      'M',
    );
  });

  it('clears the cache before the guard reads the new workspace, even when already on /jobs', async () => {
    await mountApp('/jobs');
    const store = useWorkspaceStore(pinia);
    let activeWhenNavigating: string | null | undefined;
    cleanups.push(
      router.beforeEach(() => {
        activeWhenNavigating = store.activeWorkspaceId;
      }),
    );
    await openMenu();

    items()[2]!.click();
    await vi.waitFor(() => expect(events).toContain('navigate:/jobs'));
    await flushPromises();

    expect(events).toEqual(['select', 'clear', 'navigate:/jobs']);
    // The workspace store was reset before the navigation, so nothing of An Nhiên was left.
    expect(activeWhenNavigating).not.toBe('org_1');
    expect(router.currentRoute.value.fullPath).toBe('/jobs');
    expect(trigger().querySelector('[data-testid="workspace-menu-name"]')?.textContent).toBe(
      'Hải Đăng Labs',
    );
  });

  it('disables the trigger while the switch runs', async () => {
    let answer: (response: Response) => void = () => undefined;
    switchAnswer = () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      });
    await mountApp();
    await openMenu();

    items()[1]!.click();
    await flushPromises();

    expect(trigger().disabled).toBe(true);
    expect(menu()).toBeNull();

    serverList = { ...serverList, activeWorkspaceId: 'org_2' };
    answer(jsonResponse(may));
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/jobs'));
    await flushPromises();
    expect(trigger().disabled).toBe(false);
  });

  it('choosing the active workspace only closes the menu', async () => {
    await mountApp();
    const callsBefore = fetchFn.mock.calls.length;
    await openMenu();

    items()[0]!.click();
    await flushPromises();

    expect(menu()).toBeNull();
    expect(fetchFn.mock.calls.length).toBe(callsBefore);
    expect(events).toEqual([]);
    expect(router.currentRoute.value.fullPath).toBe('/candidates');
  });

  it('on WORKSPACE_UNAVAILABLE reloads the list, says so and stays in the workspace', async () => {
    await mountApp();
    const listsBefore = requests('GET', '/api/workspaces').length;
    // Mây Studio is gone on the server.
    serverList = { activeWorkspaceId: 'org_1', workspaces: [anNhien, haiDang] };
    await openMenu();

    items()[1]!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="workspace-menu-error"]')).not.toBeNull(),
    );
    await flushPromises();

    const notice = document.querySelector<HTMLElement>('[data-testid="workspace-menu-error"]')!;
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toContain(
      'Không gian này không còn khả dụng. Danh sách đã được cập nhật.',
    );
    expect(requests('GET', '/api/workspaces').length - listsBefore).toBe(1);
    expect(events).toEqual(['select']);
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_1');
    expect(router.currentRoute.value.fullPath).toBe('/candidates');
    expect(trigger().disabled).toBe(false);
    expect(trigger().querySelector('[data-testid="workspace-menu-name"]')?.textContent).toBe(
      'An Nhiên',
    );

    await openMenu();
    expect(items().map((item) => item.textContent?.trim())).toEqual(['An Nhiên', 'Hải Đăng Labs']);
  });

  it('shows the error in English for an English-speaking user', async () => {
    meUser = { ...user, locale: 'en' };
    await mountApp();
    serverList = { activeWorkspaceId: 'org_1', workspaces: [anNhien] };
    await openMenu();
    expect(menu()!.textContent).toContain('Workspaces');

    items()[1]!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="workspace-menu-error"]')).not.toBeNull(),
    );

    expect(document.querySelector('[data-testid="workspace-menu-error"]')!.textContent).toContain(
      'This workspace is no longer available. The list has been updated.',
    );
  });

  it('shows the translated error for any other refusal and keeps the workspace', async () => {
    switchAnswer = () => jsonResponse({ code: 'SOMETHING_ELSE' }, 500);
    await mountApp();
    await openMenu();

    items()[1]!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="workspace-menu-error"]')).not.toBeNull(),
    );

    expect(document.querySelector('[data-testid="workspace-menu-error"]')!.textContent).toContain(
      i18n.global.t('errors.unknown'),
    );
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_1');
    expect(router.currentRoute.value.fullPath).toBe('/candidates');
  });

  it('clears the error on the next successful switch', async () => {
    switchAnswer = () => jsonResponse({ code: 'SOMETHING_ELSE' }, 500);
    await mountApp();
    await openMenu();
    items()[1]!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="workspace-menu-error"]')).not.toBeNull(),
    );

    switchAnswer = null;
    await openMenu();
    items()[1]!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/jobs'));
    await flushPromises();

    expect(document.querySelector('[data-testid="workspace-menu-error"]')).toBeNull();
  });

  it('opens with Enter or Space, moves with the arrows and closes with Escape onto the trigger', async () => {
    await mountApp();

    for (const opener of ['Enter', ' ']) {
      trigger().focus();
      key(trigger(), opener);
      await flushPromises();
      expect(menu()).not.toBeNull();
      expect(document.activeElement).toBe(items()[0]);

      key(document.activeElement as HTMLElement, 'ArrowDown');
      expect(document.activeElement).toBe(items()[1]);
      key(document.activeElement as HTMLElement, 'ArrowDown');
      expect(document.activeElement).toBe(items()[2]);
      key(document.activeElement as HTMLElement, 'ArrowUp');
      expect(document.activeElement).toBe(items()[1]);

      key(document.activeElement as HTMLElement, 'Escape');
      await flushPromises();
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    }
    expect(events).toEqual([]);
  });
});
