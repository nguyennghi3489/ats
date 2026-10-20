import { RESET_PASSWORD_INVALID_PATH } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import ResetPasswordInvalidView from './ResetPasswordInvalidView.vue';

const copy = viMessages.auth.resetPassword.invalid;

let router: Router;

async function mountView() {
  await router.push(RESET_PASSWORD_INVALID_PATH);
  await router.isReady();
  return mount(ResetPasswordInvalidView, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  setLocale('vi');
  vi.stubGlobal('fetch', vi.fn<typeof fetch>());
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('ResetPasswordInvalidView', () => {
  it('is the page at /reset-password/invalid', async () => {
    await router.push(RESET_PASSWORD_INVALID_PATH);
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe(RESET_PASSWORD_INVALID_PATH);
    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the REC-05 title, error notice, request button and back link', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Liên kết không hợp lệ');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Yêu cầu liên kết mới để tiếp tục.',
    );
    const notice = wrapper.get('[data-testid="reset-password-invalid-notice"]');
    expect(notice.attributes('role')).toBe('alert');
    expect(notice.text()).toBe('Không thể dùng liên kết này.');
    expect(wrapper.get('[data-testid="reset-password-invalid-request"]').text()).toBe(
      'Yêu cầu liên kết mới',
    );
    const back = wrapper.get('[data-testid="reset-password-invalid-sign-in-link"]');
    expect(back.attributes('href')).toBe('/sign-in');
    expect(wrapper.get('footer').text()).toBe('Quay lại đăng nhập');
  });

  it('"Yêu cầu liên kết mới" opens /forgot-password', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="reset-password-invalid-request"]').trigger('click');

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/forgot-password'));
  });

  it('has the English copy after switching to EN', async () => {
    const wrapper = await mountView();
    const copyEn = en.auth.resetPassword.invalid;

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.get('h1').text()).toBe(copyEn.title);
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(copyEn.subtitle);
    expect(wrapper.get('[data-testid="reset-password-invalid-notice"]').text()).toBe(copyEn.notice);
    expect(wrapper.get('[data-testid="reset-password-invalid-request"]').text()).toBe(
      copyEn.requestNew,
    );
    expect(wrapper.get('footer').text()).toBe(copyEn.backToSignIn);
  });
});
