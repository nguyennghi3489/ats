import type { WorkspaceRole } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { i18n, setLocale } from '../i18n';
import MobileNav from './MobileNav.vue';

const Page = defineComponent({ render: () => h('div') });
const PATHS = ['/applications', '/candidates', '/jobs', '/settings/workspace'];

let router: Router;
const mounted: { unmount(): void }[] = [];

async function mountNav(role: WorkspaceRole | null) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: PATHS.map((path) => ({ path, component: Page })),
  });
  await router.push('/jobs');
  await router.isReady();
  const wrapper = mount(MobileNav, {
    props: { id: 'mobile-nav', role },
    global: { plugins: [router, i18n] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => setLocale('vi'));

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('MobileNav', () => {
  it('is a named navigation landmark with the given id', async () => {
    const wrapper = await mountNav('admin');

    const nav = wrapper.get('nav');
    expect(nav.attributes('id')).toBe('mobile-nav');
    expect(nav.attributes('aria-label')).toBe('Điều hướng chính');
  });

  it('lists the admin destinations and workspace settings', async () => {
    const wrapper = await mountNav('admin');

    expect(wrapper.findAll('a').map((link) => link.text())).toEqual([
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
      'Cài đặt không gian làm việc',
    ]);
    expect(wrapper.get('a[aria-current="page"]').text()).toBe('Vị trí tuyển dụng');
  });

  it('gives a recruiter the same destinations without workspace settings', async () => {
    const wrapper = await mountNav('recruiter');

    expect(wrapper.findAll('a').map((link) => link.text())).toEqual([
      'Ứng tuyển',
      'Ứng viên',
      'Vị trí tuyển dụng',
    ]);
  });

  it('gives a collaborator only their own applications and jobs', async () => {
    const wrapper = await mountNav('collaborator');

    expect(wrapper.findAll('a').map((link) => link.text())).toEqual([
      'Ứng tuyển của tôi',
      'Vị trí của tôi',
    ]);
  });

  it('follows the locale', async () => {
    const wrapper = await mountNav('collaborator');
    setLocale('en');
    await flushPromises();

    expect(wrapper.findAll('a').map((link) => link.text())).toEqual(['My applications', 'My jobs']);
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Main navigation');
  });

  it('navigates and asks to close when an item is chosen', async () => {
    const wrapper = await mountNav('admin');

    await wrapper.findAll('a')[1]!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/candidates');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('asks to close when the current item is chosen again', async () => {
    const wrapper = await mountNav('admin');

    await wrapper.get('a[aria-current="page"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
