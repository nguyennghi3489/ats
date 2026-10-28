import type { MeUser, WorkspaceRole } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useSessionStore } from '../features/auth/session.store';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import { i18n, setLocale } from '../i18n';
import AppTopBar from './AppTopBar.vue';

const user: MeUser = {
  id: 'user-1',
  name: 'Nguyễn Văn An',
  email: 'an.nguyen@example.test',
  locale: 'vi',
  emailVerified: true,
};

const Page = defineComponent({ render: () => h('div') });
const PATHS = [
  '/applications',
  '/candidates',
  '/jobs',
  '/settings/workspace',
  '/settings/personal',
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let pinia: Pinia;
let router: Router;
const mounted: { unmount(): void }[] = [];

async function mountBar(role: WorkspaceRole | null = 'admin') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: PATHS.map((path) => ({ path, component: Page })),
  });
  await router.push('/jobs');
  await router.isReady();
  await useWorkspaceStore().load();
  const wrapper = mount(AppTopBar, {
    props: { role },
    global: { plugins: [router, pinia, i18n] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const hamburger = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="app-top-bar-menu"]')!;
const nav = () => document.querySelector<HTMLElement>('[data-testid="mobile-nav"]');

async function toggle() {
  hamburger().click();
  await flushPromises();
}

beforeEach(() => {
  setLocale('vi');
  pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().user = { ...user };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          activeWorkspaceId: 'org_1',
          workspaces: [
            { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' },
            { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'recruiter' },
          ],
        }),
      ),
    ),
  );
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('AppTopBar', () => {
  it('starts closed with a hamburger named "Mở điều hướng"', async () => {
    await mountBar();

    expect(hamburger().getAttribute('aria-expanded')).toBe('false');
    expect(hamburger().getAttribute('aria-label')).toBe('Mở điều hướng');
    expect(hamburger().getAttribute('aria-controls')).toBeNull();
    expect(nav()).toBeNull();
  });

  it('opens the list under the bar and reflects it in aria-expanded and aria-controls', async () => {
    await mountBar();
    await toggle();

    expect(hamburger().getAttribute('aria-expanded')).toBe('true');
    expect(hamburger().getAttribute('aria-label')).toBe('Đóng điều hướng');
    const list = nav()!;
    expect(hamburger().getAttribute('aria-controls')).toBe(list.querySelector('nav')!.id);
    expect([...list.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
      'Cài đặt không gian làm việc',
    ]);
  });

  it('closes on a second tap', async () => {
    await mountBar();
    await toggle();
    await toggle();

    expect(hamburger().getAttribute('aria-expanded')).toBe('false');
    expect(nav()).toBeNull();
  });

  it('shows only the collaborator destinations to a collaborator', async () => {
    await mountBar('collaborator');
    await toggle();

    expect([...nav()!.querySelectorAll('a')].map((link) => link.textContent?.trim())).toEqual([
      'Ứng tuyển của tôi',
      'Vị trí của tôi',
    ]);
  });

  it('closes on Escape from inside the list and focuses the hamburger', async () => {
    await mountBar();
    await toggle();
    const link = nav()!.querySelector('a')!;
    link.focus();

    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();

    expect(nav()).toBeNull();
    expect(hamburger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(hamburger());
  });

  it('closes on Escape while the hamburger has focus', async () => {
    await mountBar();
    await toggle();
    hamburger().focus();

    hamburger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();

    expect(nav()).toBeNull();
    expect(document.activeElement).toBe(hamburger());
  });

  it('leaves an Escape that another control already handled alone', async () => {
    await mountBar();
    await toggle();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    await flushPromises();

    expect(nav()).not.toBeNull();
  });

  it('opens the chosen page and closes the list', async () => {
    await mountBar();
    await toggle();

    const candidates = [...nav()!.querySelectorAll('a')].find(
      (link) => link.textContent?.trim() === 'Ứng viên',
    )!;
    candidates.click();
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/candidates');
    expect(nav()).toBeNull();
    expect(hamburger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when the route changes from elsewhere', async () => {
    await mountBar();
    await toggle();

    await router.push('/settings/personal');
    await flushPromises();

    expect(nav()).toBeNull();
  });

  it('holds the compact workspace trigger: the name and a chevron, no tile', async () => {
    const wrapper = await mountBar();

    const trigger = wrapper.get('[data-testid="workspace-menu-trigger"]');
    expect(trigger.get('[data-testid="workspace-menu-name"]').text()).toBe('An Nhiên');
    expect(trigger.find('[data-testid="workspace-menu-initial"]').exists()).toBe(false);
    expect(trigger.classes()).toContain('workspace-menu__trigger--compact');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
  });

  it('holds the account menu behind a round initials avatar', async () => {
    const wrapper = await mountBar();

    const trigger = wrapper.get('[data-testid="account-menu-trigger"]');
    expect(trigger.attributes('aria-label')).toBe('Tài khoản của Nguyễn Văn An');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
    expect(trigger.get('[data-testid="account-menu-avatar"]').text()).toBe('NA');
  });

  it('opens the account menu under the avatar', async () => {
    const wrapper = await mountBar();

    await wrapper.get('[data-testid="account-menu-trigger"]').trigger('click');
    await flushPromises();

    expect(document.querySelector('[role="menu"]')?.textContent).toContain('Tài khoản cá nhân');
  });

  it('follows the locale', async () => {
    await mountBar();
    setLocale('en');
    await flushPromises();

    expect(hamburger().getAttribute('aria-label')).toBe('Open navigation');
    await toggle();
    expect(hamburger().getAttribute('aria-label')).toBe('Close navigation');
  });
});
