import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import ForgotPasswordView from './ForgotPasswordView.vue';

const copy = viMessages.auth.forgotPassword;
const REQUEST_PATH = '/api/auth/request-password-reset';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** What the API answers for every address, with or without an account. */
const accepted = () => jsonResponse({ status: true, message: 'If this email exists…' });
const refused = (code: 'RESEND_TOO_SOON' | 'RESEND_LIMIT', retryAfterSeconds: number) =>
  jsonResponse({ code, message: code, retryAfterSeconds }, 429);

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;

/** URL and parsed JSON body of the n-th fetch call. */
async function callAt(index = 0) {
  const [input, init] = fetchFn.mock.calls[index]!;
  const request = input instanceof Request ? input : new Request(input, init);
  const text = await request.clone().text();
  return { url: request.url, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
}

async function mountView(path = '/forgot-password') {
  await router.push(path);
  await router.isReady();
  return mount(ForgotPasswordView, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const emailInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="forgot-password-email"]');
const submitButton = (w: Wrapper) => w.get('button[type="submit"]');
const resendButton = (w: Wrapper) =>
  w.get<HTMLButtonElement>('[data-testid="forgot-password-resend"]');
const requestError = (w: Wrapper) => w.find('[data-testid="forgot-password-error"]');

async function submit(w: Wrapper) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

/** Fills a valid address and sends it. */
async function request(w: Wrapper, email = 'minh.anh@example.test') {
  await emailInput(w).setValue(email);
  await submit(w);
}

/** Fakes only the clock and intervals, so `flushPromises` keeps working. */
function fakeClock() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
}

beforeEach(() => {
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('ForgotPasswordView', () => {
  it('is the page at /forgot-password', async () => {
    await router.push('/forgot-password');
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the REC-01 title, email field, button and the link back to sign-in', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Khôi phục mật khẩu');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Nhập email để nhận hướng dẫn.',
    );
    expect(wrapper.get('label').text().replace('*', '')).toBe('Email');
    expect(emailInput(wrapper).attributes('type')).toBe('email');
    expect(emailInput(wrapper).attributes('autocomplete')).toBe('email');
    expect(emailInput(wrapper).element.value).toBe('');
    expect(submitButton(wrapper).text()).toBe('Gửi hướng dẫn');
    const back = wrapper.get('[data-testid="forgot-password-sign-in-link"]');
    expect(back.attributes('href')).toBe('/sign-in');
    expect(wrapper.get('footer').text()).toBe('Quay lại đăng nhập');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('prefills the email from the query', async () => {
    const wrapper = await mountView('/forgot-password?email=minh.anh%40example.test');

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
    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the field error for an empty address and clears it once fixed', async () => {
    const wrapper = await mountView();

    await submit(wrapper);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(copy.errors.EMAIL_INVALID);

    await emailInput(wrapper).setValue('minh.anh@example.test');
    expect(wrapper.text()).not.toContain(copy.errors.EMAIL_INVALID);
  });

  it('sends the trimmed address and shows the REC-02 check-email state', async () => {
    fetchFn.mockResolvedValue(accepted());
    const wrapper = await mountView();

    await request(wrapper, '  minh.anh@example.test ');

    expect(fetchFn).toHaveBeenCalledOnce();
    const call = await callAt();
    expect(new URL(call.url).pathname).toBe(REQUEST_PATH);
    expect(call.body).toEqual({ email: 'minh.anh@example.test' });

    expect(wrapper.get('h1').text()).toBe('Kiểm tra email');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Nếu có tài khoản phù hợp, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
    );
    const notice = wrapper.get('[data-testid="forgot-password-sent-notice"]');
    expect(notice.attributes('role')).toBe('status');
    expect(notice.text()).toBe('Bạn có thể quay lại đăng nhập hoặc đóng trang này.');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('footer').exists()).toBe(false);
    expect(wrapper.get('[data-testid="forgot-password-back"]').text()).toBe('Quay lại đăng nhập');
  });

  it('shows the same state whether or not the address has an account', async () => {
    // The API answers both the same; the page has nothing else to go on and shows no address.
    fetchFn.mockImplementation(async () => accepted());
    const known = await mountView();
    await request(known, 'minh.anh@example.test');
    const knownHtml = known.html();
    known.unmount();

    const unknown = await mountView();
    await request(unknown, 'unknown@example.test');

    expect(unknown.html()).toBe(knownHtml);
  });

  it('goes back to sign-in from the primary button', async () => {
    fetchFn.mockResolvedValue(accepted());
    const wrapper = await mountView();
    await request(wrapper);

    await wrapper.get('[data-testid="forgot-password-back"]').trigger('click');

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/sign-in'));
  });

  it('keeps "Gửi lại" disabled for 60 s with a countdown, then sends again', async () => {
    fakeClock();
    fetchFn.mockImplementation(async () => accepted());
    const wrapper = await mountView();
    await request(wrapper);

    expect(resendButton(wrapper).element.disabled).toBe(true);
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 60 giây');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 59 giây');

    await vi.advanceTimersByTimeAsync(58_000);
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 1 giây');
    expect(resendButton(wrapper).element.disabled).toBe(true);
    await resendButton(wrapper).trigger('click');
    expect(fetchFn).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(resendButton(wrapper).element.disabled).toBe(false);
    expect(resendButton(wrapper).text()).toBe('Gửi lại');

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const call = await callAt(1);
    expect(new URL(call.url).pathname).toBe(REQUEST_PATH);
    expect(call.body).toEqual({ email: 'minh.anh@example.test' });
    expect(resendButton(wrapper).element.disabled).toBe(true);
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 60 giây');
    expect(wrapper.get('h1').text()).toBe(copy.sentTitle);
  });

  it('stops the countdown when the page is left', async () => {
    fakeClock();
    fetchFn.mockResolvedValue(accepted());
    const wrapper = await mountView();
    await request(wrapper);
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the translated limit message when a resend is refused', async () => {
    fakeClock();
    fetchFn.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(refused('RESEND_LIMIT', 1800));
    const wrapper = await mountView();
    await request(wrapper);
    await vi.advanceTimersByTimeAsync(60_000);

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    const alert = requestError(wrapper);
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe(copy.errors.RESEND_LIMIT);
    expect(wrapper.get('h1').text()).toBe(copy.sentTitle);
  });

  it('waits as long as the API says when a resend comes too soon', async () => {
    fakeClock();
    fetchFn.mockResolvedValueOnce(accepted()).mockResolvedValueOnce(refused('RESEND_TOO_SOON', 12));
    const wrapper = await mountView();
    await request(wrapper);
    await vi.advanceTimersByTimeAsync(60_000);

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    expect(requestError(wrapper).text()).toBe(copy.errors.RESEND_TOO_SOON);
    expect(resendButton(wrapper).element.disabled).toBe(true);
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 12 giây');
  });

  it('clears the resend error once a resend goes through', async () => {
    fakeClock();
    fetchFn
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(refused('RESEND_TOO_SOON', 5))
      .mockResolvedValueOnce(accepted());
    const wrapper = await mountView();
    await request(wrapper);
    await vi.advanceTimersByTimeAsync(60_000);
    await resendButton(wrapper).trigger('click');
    await flushPromises();
    expect(requestError(wrapper).exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    await resendButton(wrapper).trigger('click');
    await flushPromises();

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(requestError(wrapper).exists()).toBe(false);
  });

  it.each([
    ['RESEND_TOO_SOON', 50],
    ['RESEND_LIMIT', 1800],
  ] as const)('shows the translated %s message on the form', async (code, seconds) => {
    fetchFn.mockResolvedValue(refused(code, seconds));
    const wrapper = await mountView();

    await request(wrapper);

    const alert = requestError(wrapper);
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toBe(copy.errors[code]);
    expect(wrapper.get('h1').text()).toBe(copy.title);
    expect(submitButton(wrapper).attributes('aria-busy')).toBeUndefined();
    expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
  });

  it('shows the translated network error', async () => {
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const wrapper = await mountView();

    await request(wrapper);

    expect(requestError(wrapper).text()).toBe(viMessages.errors.NETWORK_ERROR);
  });

  it('shows the generic error for a code the app has no text for, never the API message', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ code: 'SOMETHING_ODD', message: 'Raw hint' }, 500));
    const wrapper = await mountView();

    await request(wrapper);

    expect(requestError(wrapper).text()).toBe(viMessages.errors.unknown);
    expect(wrapper.text()).not.toContain('Raw hint');
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
    answer(accepted());
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe(copy.sentTitle);
  });

  it('has the English copy after switching to EN', async () => {
    fakeClock();
    fetchFn.mockResolvedValue(accepted());
    const wrapper = await mountView();
    const copyEn = en.auth.forgotPassword;

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');
    await emailInput(wrapper).setValue('x');
    await submit(wrapper);

    expect(wrapper.get('h1').text()).toBe(copyEn.title);
    expect(wrapper.text()).toContain(copyEn.subtitle);
    expect(wrapper.get('label').text().replace('*', '')).toBe(copyEn.email);
    expect(submitButton(wrapper).text()).toBe(copyEn.submit);
    expect(wrapper.get('footer').text()).toBe(copyEn.backToSignIn);
    expect(wrapper.text()).toContain(copyEn.errors.EMAIL_INVALID);

    await request(wrapper);
    expect(wrapper.get('h1').text()).toBe(copyEn.sentTitle);
    expect(wrapper.text()).toContain(copyEn.sentSubtitle);
    expect(wrapper.get('[data-testid="forgot-password-sent-notice"]').text()).toBe(
      copyEn.sentNotice,
    );
    expect(wrapper.get('[data-testid="forgot-password-back"]').text()).toBe(copyEn.backToSignIn);
    expect(resendButton(wrapper).text()).toBe('Send again in 60 seconds');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(resendButton(wrapper).text()).toBe('Send again in 1 second');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(resendButton(wrapper).text()).toBe(copyEn.resend);
  });
});
