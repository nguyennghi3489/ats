// Node types for this spec only: the breakpoint test reads the component stylesheet from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MeUser, WorkspaceRole } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useSessionStore } from '../features/auth/session.store';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import { i18n, setLocale } from '../i18n';
import AppLayout from './AppLayout.vue';

const user: MeUser = {
  id: 'user-1',
  name: 'Minh Anh',
  email: 'minh.anh@example.test',
  locale: 'vi',
  emailVerified: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const Page = defineComponent({ render: () => h('p', { 'data-testid': 'child-page' }, 'Trang') });

let pinia: Pinia;
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let role: WorkspaceRole = 'admin';

function workspaceCalls(): number {
  return fetchFn.mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).endsWith('/api/workspaces'),
  ).length;
}

async function mountLayout(slots?: Record<string, () => unknown>) {
  // The layout is the root here, so its RouterView renders the top-level route.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/jobs', component: Page }],
  });
  await router.push('/jobs');
  await router.isReady();
  const wrapper = mount(AppLayout, {
    slots,
    global: { plugins: [router, pinia, i18n] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const mounted: { unmount(): void }[] = [];

beforeEach(() => {
  setLocale('vi');
  pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().user = user;
  role = 'admin';
  fetchFn = vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(
      jsonResponse({
        activeWorkspaceId: 'org_1',
        workspaces: [
          { id: 'org_0', name: 'Mây Studio', codePrefix: 'MS', role: 'collaborator' },
          { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role },
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('AppLayout', () => {
  it('renders the sidebar next to a main area that holds the routed page', async () => {
    const wrapper = await mountLayout();
    mounted.push(wrapper);

    expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);
    const main = wrapper.get('main');
    expect(main.find('[data-testid="child-page"]').exists()).toBe(true);
    expect(main.find('[data-testid="app-sidebar"]').exists()).toBe(false);
  });

  it('loads the workspaces once and uses the role in the active workspace', async () => {
    role = 'recruiter';
    const wrapper = await mountLayout();
    mounted.push(wrapper);

    expect(workspaceCalls()).toBe(1);
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Nhà tuyển dụng');
    expect(wrapper.get('[data-testid="app-sidebar-user-name"]').text()).toBe('Minh Anh');
    expect(wrapper.findAll('nav a').map((link) => link.text())).toEqual([
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
    ]);
  });

  it('does not ask again when the workspace list is already loaded', async () => {
    await useWorkspaceStore().load();
    fetchFn.mockClear();

    const wrapper = await mountLayout();
    mounted.push(wrapper);

    expect(workspaceCalls()).toBe(0);
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Quản trị viên');
  });

  it('follows a switch of the active workspace', async () => {
    const wrapper = await mountLayout();
    mounted.push(wrapper);

    useWorkspaceStore().activeWorkspaceId = 'org_0';
    await flushPromises();

    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Cộng tác viên');
    expect(wrapper.findAll('nav a').map((link) => link.text())).toEqual([
      'Ứng tuyển của tôi',
      'Vị trí của tôi',
    ]);
  });

  it('passes the workspace and account slots to the sidebar', async () => {
    const wrapper = await mountLayout({
      workspace: () => h('button', { 'data-testid': 'ws-slot' }, 'An Nhiên'),
      account: () => h('button', { 'data-testid': 'account-slot' }, '...'),
    });
    mounted.push(wrapper);

    const sidebar = wrapper.get('[data-testid="app-sidebar"]');
    expect(sidebar.find('[data-testid="ws-slot"]').exists()).toBe(true);
    expect(sidebar.find('[data-testid="account-slot"]').exists()).toBe(true);
  });

  it('puts the account menu next to the user name by default', async () => {
    const wrapper = await mountLayout();
    mounted.push(wrapper);

    const trigger = wrapper.get(
      '[data-testid="app-sidebar-user"] [data-testid="account-menu-trigger"]',
    );
    expect(trigger.attributes('aria-label')).toBe('Tài khoản của Minh Anh');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
  });

  describe('below 768 px', () => {
    let matches: boolean;
    let listeners: Array<(event: MediaQueryListEvent) => void>;

    function resize(width: number) {
      matches = width >= 768;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    }

    beforeEach(() => {
      matches = false;
      listeners = [];
      vi.stubGlobal('matchMedia', (query: string) => {
        expect(query).toBe('(min-width: 768px)');
        return {
          get matches() {
            return matches;
          },
          media: query,
          addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.push(listener),
          removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.splice(listeners.indexOf(listener), 1),
        } as unknown as MediaQueryList;
      });
    });

    it('shows the top bar instead of the sidebar, above the routed page', async () => {
      const wrapper = await mountLayout();
      mounted.push(wrapper);

      expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(false);
      const bar = wrapper.get('[data-testid="app-top-bar"]');
      expect(bar.find('[data-testid="workspace-menu-trigger"]').exists()).toBe(true);
      expect(bar.find('[data-testid="account-menu-trigger"]').exists()).toBe(true);
      expect(wrapper.get('main').find('[data-testid="child-page"]').exists()).toBe(true);
    });

    it('swaps to the sidebar and drops an open list when the viewport grows to 768 px', async () => {
      const wrapper = await mountLayout();
      mounted.push(wrapper);
      await wrapper.get('[data-testid="app-top-bar-menu"]').trigger('click');
      expect(wrapper.find('[data-testid="mobile-nav"]').exists()).toBe(true);

      resize(1024);
      await flushPromises();

      expect(wrapper.find('[data-testid="app-top-bar"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="mobile-nav"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);

      resize(360);
      await flushPromises();

      expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="app-top-bar-menu"]').attributes('aria-expanded')).toBe(
        'false',
      );
    });

    it('stops listening once unmounted', async () => {
      const wrapper = await mountLayout();
      expect(listeners).toHaveLength(1);

      wrapper.unmount();

      expect(listeners).toHaveLength(0);
    });
  });

  it('hides the sidebar below 768 px', () => {
    const source = readFileSync(join(__dirname, 'AppLayout.vue'), 'utf8');
    const mobile = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';

    expect(mobile).toMatch(/\.app-layout__sidebar\s*\{\s*display: none;/);
    expect(mobile).toMatch(/grid-template-columns: minmax\(0, 1fr\);/);
    expect(source).toMatch(
      /@media \(min-width: 768px\) \{\s*\.app-layout__top-bar \{\s*display: none;/,
    );
  });
});
