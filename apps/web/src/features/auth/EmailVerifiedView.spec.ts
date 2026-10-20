import { VERIFY_EMAIL_SUCCESS_PATH } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import EmailVerifiedView from './EmailVerifiedView.vue';

const copy = viMessages.auth.verified;

let router: Router;

async function mountView() {
  await router.push(VERIFY_EMAIL_SUCCESS_PATH);
  await router.isReady();
  return mount(EmailVerifiedView, {
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

describe('EmailVerifiedView', () => {
  it('is the page at /verify-email/success', async () => {
    await router.push(VERIFY_EMAIL_SUCCESS_PATH);
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the AUTH-05 title, subtitle, success notice and sign-in button', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Email đã được xác minh');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Tài khoản của bạn đã sẵn sàng.',
    );
    const notice = wrapper.get('[data-testid="verified-notice"]');
    expect(notice.attributes('role')).toBe('status');
    expect(notice.classes()).toContain('ats-notice--success');
    expect(notice.text()).toBe('Xác minh thành công.');
    expect(wrapper.get('[data-testid="verified-sign-in"]').text()).toBe('Đăng nhập');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('goes to /sign-in from the sign-in button', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="verified-sign-in"]').trigger('click');

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/sign-in'));
  });

  it('has the English copy after switching to EN', async () => {
    const wrapper = await mountView();

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.get('h1').text()).toBe(en.auth.verified.title);
    expect(wrapper.text()).toContain(en.auth.verified.subtitle);
    expect(wrapper.get('[data-testid="verified-notice"]').text()).toBe(en.auth.verified.notice);
    expect(wrapper.get('[data-testid="verified-sign-in"]').text()).toBe(en.auth.verified.signIn);
  });
});
