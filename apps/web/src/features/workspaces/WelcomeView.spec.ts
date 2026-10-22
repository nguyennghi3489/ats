import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import WelcomeView from './WelcomeView.vue';

let router: Router;
let pinia: Pinia;

async function mountView() {
  await router.push('/welcome');
  await router.isReady();
  const wrapper = mount(WelcomeView, {
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setLocale('vi');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 })),
  );
  pinia = createPinia();
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('WelcomeView', () => {
  it('is the signed-in page at /welcome, only for users without a workspace', async () => {
    await router.push('/welcome');

    expect(router.currentRoute.value.name).toBe('welcome');
    expect(router.currentRoute.value.meta.public).toBeUndefined();
    expect(router.currentRoute.value.meta.requiresWorkspace).toBeUndefined();
    expect(router.currentRoute.value.meta.withoutWorkspace).toBe(true);
  });

  it('shows WS-06: title, subtitle, info notice, "Tạo không gian" and the invitation hint', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Tiếp tục thiết lập');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Tài khoản này chưa có không gian làm việc.',
    );
    const notice = wrapper.get('[data-testid="welcome-notice"]');
    expect(notice.classes()).toContain('ats-notice--info');
    expect(notice.attributes('role')).toBe('status');
    expect(notice.text()).toBe('Bạn có thể tiếp tục bằng cách tạo không gian làm việc.');
    expect(wrapper.get('[data-testid="welcome-create"]').text()).toBe('Tạo không gian');
    expect(wrapper.get('[data-testid="welcome-invite-hint"]').text()).toBe(
      'Muốn tham gia không gian hiện có? Hãy nhờ quản trị viên gửi lời mời.',
    );
  });

  it('"Tạo không gian" opens /workspaces/new', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="welcome-create"]').trigger('click');

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/workspaces/new'));
  });

  it('"Tạo không gian" is a primary button reachable with the keyboard', async () => {
    const wrapper = await mountView();
    const button = wrapper.get<HTMLButtonElement>('[data-testid="welcome-create"]');

    expect(button.element.tagName).toBe('BUTTON');
    expect(button.element.disabled).toBe(false);
    expect(button.classes()).toContain('ats-button--primary');
  });

  it('reads in English', async () => {
    setLocale('en');
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe(en.workspaces.welcome.title);
    expect(wrapper.get('[data-testid="welcome-create"]').text()).toBe(en.workspaces.welcome.create);
  });

  it('has the same keys in vi and en', () => {
    expect(Object.keys(en.workspaces.welcome).sort()).toEqual(
      Object.keys(viMessages.workspaces.welcome).sort(),
    );
  });
});
