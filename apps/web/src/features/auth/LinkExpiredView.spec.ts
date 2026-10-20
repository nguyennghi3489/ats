import { VERIFY_EMAIL_EXPIRED_PATH } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import LinkExpiredView from './LinkExpiredView.vue';

const copy = viMessages.auth.linkExpired;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sent = () => jsonResponse({ status: true });

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;

/** URL and parsed JSON body of the n-th fetch call. */
async function callAt(index = 0) {
  const [input, init] = fetchFn.mock.calls[index]!;
  const request = input instanceof Request ? input : new Request(input, init);
  const text = await request.clone().text();
  return { url: request.url, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
}

async function mountView(path: string = VERIFY_EMAIL_EXPIRED_PATH) {
  await router.push(path);
  await router.isReady();
  return mount(LinkExpiredView, { global: { plugins: [i18n, router] }, attachTo: document.body });
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const emailInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="link-expired-email"]');
const submitButton = (w: Wrapper) => w.get('button[type="submit"]');
const requestError = (w: Wrapper) => w.find('[data-testid="link-expired-request-error"]');

async function submit(w: Wrapper) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

/** Waits for the navigation to finish: the target route's component is loaded lazily. */
async function arrivedAt(path: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path));
}

beforeEach(() => {
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('LinkExpiredView', () => {
  it('is the page at /verify-email/expired', async () => {
    await router.push(VERIFY_EMAIL_EXPIRED_PATH);
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the AUTH-06 title, error notice, recipient field, button and back link', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Liên kết đã hết hạn');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Yêu cầu liên kết mới để tiếp tục xác minh.',
    );
    const notice = wrapper.get('[data-testid="link-expired-notice"]');
    expect(notice.attributes('role')).toBe('alert');
    expect(notice.text()).toBe('Liên kết xác minh không còn hiệu lực.');
    expect(wrapper.get('label').text().replace('*', '')).toBe('Người nhận');
    expect(emailInput(wrapper).attributes('type')).toBe('email');
    expect(emailInput(wrapper).attributes('autocomplete')).toBe('email');
    expect(emailInput(wrapper).element.value).toBe('');
    expect(emailInput(wrapper).attributes('placeholder')).toBe('minh.anh@example.com');
    expect(submitButton(wrapper).text()).toBe('Gửi liên kết mới');
    const back = wrapper.get('[data-testid="link-expired-sign-in-link"]');
    expect(back.attributes('href')).toBe('/sign-in');
    expect(wrapper.get('footer').text()).toBe('Quay lại đăng nhập');
    expect(requestError(wrapper).exists()).toBe(false);
  });

  it('prefills the recipient from the email query', async () => {
    const wrapper = await mountView(`${VERIFY_EMAIL_EXPIRED_PATH}?email=minh.anh%40example.test`);

    expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
  });

  it('shows the field error and sends nothing for an invalid address', async () => {
    const wrapper = await mountView();

    await emailInput(wrapper).setValue('minh.anh@');
    await submit(wrapper);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Nhập địa chỉ email hợp lệ');
    expect(emailInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(emailInput(wrapper).element);
    expect(router.currentRoute.value.path).toBe(VERIFY_EMAIL_EXPIRED_PATH);
  });

  it('shows the field error for an empty address and clears it once fixed', async () => {
    const wrapper = await mountView();

    await submit(wrapper);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(copy.errors.EMAIL_INVALID);

    await emailInput(wrapper).setValue('minh.anh@example.test');
    expect(wrapper.text()).not.toContain(copy.errors.EMAIL_INVALID);
  });

  it('sends a new link to the trimmed address and opens the check-email page', async () => {
    fetchFn.mockResolvedValue(sent());
    const wrapper = await mountView();

    await emailInput(wrapper).setValue('  minh.anh@example.test ');
    await submit(wrapper);

    expect(fetchFn).toHaveBeenCalledOnce();
    const call = await callAt();
    expect(new URL(call.url).pathname).toBe('/api/auth/send-verification-email');
    expect(call.body).toMatchObject({ email: 'minh.anh@example.test' });
    await arrivedAt('/verify-email');
    expect(router.currentRoute.value.fullPath).toBe('/verify-email?email=minh.anh%40example.test');
  });

  it('shows the pending button and sends one request when submitted again meanwhile', async () => {
    let answer: (response: Response) => void = () => {};
    fetchFn.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const wrapper = await mountView();
    await emailInput(wrapper).setValue('minh.anh@example.test');

    await submit(wrapper);
    expect(submitButton(wrapper).attributes('aria-busy')).toBe('true');
    await submit(wrapper);
    await submitButton(wrapper).trigger('click');
    await flushPromises();

    expect(fetchFn).toHaveBeenCalledOnce();
    answer(sent());
    await arrivedAt('/verify-email');
  });

  it.each([
    ['RESEND_TOO_SOON', 50],
    ['RESEND_LIMIT', 1800],
  ] as const)('shows the translated %s message and stays on the page', async (code, seconds) => {
    fetchFn.mockResolvedValue(
      jsonResponse({ code, message: code, retryAfterSeconds: seconds }, 429),
    );
    const wrapper = await mountView();

    await emailInput(wrapper).setValue('minh.anh@example.test');
    await submit(wrapper);

    const alert = requestError(wrapper);
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe(copy.errors[code]);
    expect(router.currentRoute.value.path).toBe(VERIFY_EMAIL_EXPIRED_PATH);
    expect(submitButton(wrapper).attributes('aria-busy')).toBeUndefined();
    expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
  });

  it('shows the translated network error', async () => {
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const wrapper = await mountView();

    await emailInput(wrapper).setValue('minh.anh@example.test');
    await submit(wrapper);

    expect(requestError(wrapper).text()).toBe(viMessages.errors.NETWORK_ERROR);
  });

  it('shows the generic error for a code the app has no text for, never the API message', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ code: 'SOMETHING_ODD', message: 'Raw hint' }, 500));
    const wrapper = await mountView();

    await emailInput(wrapper).setValue('minh.anh@example.test');
    await submit(wrapper);

    expect(requestError(wrapper).text()).toBe(viMessages.errors.unknown);
    expect(wrapper.text()).not.toContain('Raw hint');
  });

  it('clears the request error when the address is sent again', async () => {
    fetchFn.mockResolvedValueOnce(
      jsonResponse({ code: 'RESEND_LIMIT', message: 'RESEND_LIMIT', retryAfterSeconds: 60 }, 429),
    );
    let answer: (response: Response) => void = () => {};
    fetchFn.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const wrapper = await mountView();
    await emailInput(wrapper).setValue('minh.anh@example.test');
    await submit(wrapper);
    expect(requestError(wrapper).exists()).toBe(true);

    await submit(wrapper);

    expect(requestError(wrapper).exists()).toBe(false);
    answer(sent());
    await arrivedAt('/verify-email');
  });

  it('has the English copy after switching to EN', async () => {
    const wrapper = await mountView();

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');
    await emailInput(wrapper).setValue('x');
    await submit(wrapper);

    const copyEn = en.auth.linkExpired;
    expect(wrapper.get('h1').text()).toBe(copyEn.title);
    expect(wrapper.text()).toContain(copyEn.subtitle);
    expect(wrapper.get('[data-testid="link-expired-notice"]').text()).toBe(copyEn.notice);
    expect(wrapper.get('label').text().replace('*', '')).toBe(copyEn.email);
    expect(emailInput(wrapper).attributes('placeholder')).toBe('minh.anh@example.com');
    expect(submitButton(wrapper).text()).toBe(copyEn.submit);
    expect(wrapper.get('footer').text()).toBe(copyEn.backToSignIn);
    expect(wrapper.text()).toContain(copyEn.errors.EMAIL_INVALID);
  });
});
