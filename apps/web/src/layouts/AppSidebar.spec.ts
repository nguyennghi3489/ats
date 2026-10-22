import type { WorkspaceRole } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n, setLocale } from '../i18n';
import AppSidebar from './AppSidebar.vue';

const Page = defineComponent({ render: () => h('div') });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/applications', '/candidates', '/jobs', '/settings/workspace'].map((path) => ({
      path,
      component: Page,
    })),
  });
}

const mounted: { unmount(): void }[] = [];

beforeEach(() => {
  setLocale('vi');
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  setLocale('vi');
});

async function mountSidebar(
  role: WorkspaceRole | null,
  options: { path?: string; userName?: string; slots?: Record<string, () => unknown> } = {},
) {
  const router = makeRouter();
  await router.push(options.path ?? '/jobs');
  await router.isReady();
  const wrapper = mount(AppSidebar, {
    props: { role, userName: options.userName ?? 'Minh Anh' },
    slots: options.slots,
    global: { plugins: [router, i18n] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

function linkTexts(wrapper: Awaited<ReturnType<typeof mountSidebar>>) {
  return wrapper.findAll('a').map((link) => link.text());
}

describe('AppSidebar', () => {
  it('shows an admin the three destinations, workspace settings and the admin role', async () => {
    const wrapper = await mountSidebar('admin');

    expect(linkTexts(wrapper)).toEqual([
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
      'Cài đặt không gian làm việc',
    ]);
    expect(wrapper.find('a[href="/settings/workspace"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="app-sidebar-user-name"]').text()).toBe('Minh Anh');
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Quản trị viên');
  });

  it('shows a recruiter the three destinations without workspace settings', async () => {
    const wrapper = await mountSidebar('recruiter');

    expect(linkTexts(wrapper)).toEqual(['Ứng tuyển', 'Ứng viên', 'Vị trí tuyển dụng']);
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Nhà tuyển dụng');
  });

  it('shows a collaborator only their applications and jobs', async () => {
    const wrapper = await mountSidebar('collaborator');

    expect(linkTexts(wrapper)).toEqual(['Ứng tuyển của tôi', 'Vị trí của tôi']);
    expect(wrapper.find('a[href="/candidates"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Cộng tác viên');
  });

  it('shows no destinations and no role without an active workspace', async () => {
    const wrapper = await mountSidebar(null);

    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.find('[data-testid="app-sidebar-user-role"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="app-sidebar-user-name"]').text()).toBe('Minh Anh');
  });

  it('marks the current route with aria-current="page" and no other item', async () => {
    const wrapper = await mountSidebar('admin', { path: '/candidates' });

    const current = wrapper.findAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.text()).toBe('Ứng viên');
  });

  it('marks workspace settings current on its page', async () => {
    const wrapper = await mountSidebar('admin', { path: '/settings/workspace' });

    expect(wrapper.get('[aria-current="page"]').text()).toBe('Cài đặt không gian làm việc');
  });

  it('labels the navigation landmark', async () => {
    const wrapper = await mountSidebar('admin');

    expect(wrapper.get('nav').attributes('aria-label')).toBe('Điều hướng chính');
  });

  it('shows the initials of the first and last word of the name in the avatar', async () => {
    const wrapper = await mountSidebar('admin', { userName: 'Nguyễn Văn An' });

    const avatar = wrapper.get('[data-testid="app-sidebar-avatar"]');
    expect(avatar.text()).toBe('NA');
    expect(avatar.attributes('aria-hidden')).toBe('true');
  });

  it('uses one initial for a one-word name and none for a blank one', async () => {
    const one = await mountSidebar('admin', { userName: 'minh' });
    expect(one.get('[data-testid="app-sidebar-avatar"]').text()).toBe('M');

    const blank = await mountSidebar('admin', { userName: '  ' });
    expect(blank.get('[data-testid="app-sidebar-avatar"]').text()).toBe('');
  });

  it('renders the workspace slot on top and the account slot in the user row', async () => {
    const wrapper = await mountSidebar('admin', {
      slots: {
        workspace: () => h('button', { 'data-testid': 'ws-slot' }, 'An Nhiên'),
        account: () => h('button', { 'data-testid': 'account-slot' }, '...'),
      },
    });

    const sidebar = wrapper.get('[data-testid="app-sidebar"]').element;
    const focusable = [...sidebar.querySelectorAll('a, button')].map(
      (element) => element.getAttribute('data-testid') ?? element.textContent?.trim(),
    );
    expect(focusable).toEqual([
      'ws-slot',
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
      'Cài đặt không gian làm việc',
      'account-slot',
    ]);
    expect(
      wrapper.get('[data-testid="app-sidebar-user"]').find('[data-testid="account-slot"]').exists(),
    ).toBe(true);
  });

  it('has English labels and roles', async () => {
    setLocale('en');
    const wrapper = await mountSidebar('admin');

    expect(linkTexts(wrapper)).toEqual([
      'Applications',
      'Candidates',
      'Jobs',
      'Workspace settings',
    ]);
    expect(wrapper.get('[data-testid="app-sidebar-user-role"]').text()).toBe('Admin');
  });

  it('draws a decorative icon on every item', async () => {
    const wrapper = await mountSidebar('admin');

    const icons = wrapper.findAll('a').map((link) => link.find('svg[aria-hidden="true"]').exists());
    expect(icons).toEqual([true, true, true, true]);
  });
});
