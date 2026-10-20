import { RESET_PASSWORD_INVALID_PATH, RESET_PASSWORD_PATH } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import ResetPasswordView from './ResetPasswordView.vue';

const copy = viMessages.auth.resetPassword;
const token = 'tok-abc123';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const resetDone = () => jsonResponse({ status: true });
const invalidToken = () => jsonResponse({ code: 'INVALID_TOKEN', message: 'Invalid token' }, 400);

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;

/** URL and parsed JSON body of the n-th fetch call. */
async function callAt(index = 0) {
  const [input, init] = fetchFn.mock.calls[index]!;
  const request = input instanceof Request ? input : new Request(input, init);
  const text = await request.clone().text();
  return { url: request.url, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
}

async function mountView(path = `${RESET_PASSWORD_PATH}?token=${token}`) {
  await router.push(path);
  await router.isReady();
  return mount(ResetPasswordView, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  });
}

/** The whole app at `path`, so route guards and redirects apply. */
async function mountApp(path: string) {
  await router.push(path);
  await router.isReady();
  const App = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(App, { global: { plugins: [i18n, router] } });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const passwordInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="reset-password-new"]');
const confirmInput = (w: Wrapper) =>
  w.get<HTMLInputElement>('[data-testid="reset-password-confirm"]');
const passwordToggle = (w: Wrapper) =>
  w.get<HTMLButtonElement>('[data-testid="reset-password-new-toggle"]');
const confirmToggle = (w: Wrapper) =>
  w.get<HTMLButtonElement>('[data-testid="reset-password-confirm-toggle"]');
const submitButton = (w: Wrapper) => w.get<HTMLButtonElement>('button[type="submit"]');

async function fill(w: Wrapper, password: string, confirm: string) {
  await passwordInput(w).setValue(password);
  await passwordInput(w).trigger('blur');
  await confirmInput(w).setValue(confirm);
  await confirmInput(w).trigger('blur');
}

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

describe('ResetPasswordView', () => {
  it('is the page at /reset-password with a token', async () => {
    const wrapper = await mountApp(`${RESET_PASSWORD_PATH}?token=${token}`);

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it.each([
    RESET_PASSWORD_PATH,
    `${RESET_PASSWORD_PATH}?token=`,
    `${RESET_PASSWORD_PATH}?token=%20`,
  ])('sends %s to the invalid-link page', async (path) => {
    const wrapper = await mountApp(path);

    expect(router.currentRoute.value.fullPath).toBe(RESET_PASSWORD_INVALID_PATH);
    expect(wrapper.get('h1').text()).toBe(copy.invalid.title);
  });

  it('shows the REC-03 form: two password fields with toggles, the helper and the button', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Đặt mật khẩu mới');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Tạo mật khẩu mới cho tài khoản của bạn.',
    );
    const labels = wrapper.findAll('label').map((label) => label.text().replace('*', ''));
    expect(labels).toEqual(['Mật khẩu mới', 'Nhập lại mật khẩu']);
    for (const input of [passwordInput(wrapper), confirmInput(wrapper)]) {
      expect(input.attributes('type')).toBe('password');
      expect(input.attributes('autocomplete')).toBe('new-password');
    }
    expect(wrapper.text()).toContain('Ít nhất 8 ký tự');
    expect(passwordToggle(wrapper).text()).toBe('Hiện');
    expect(confirmToggle(wrapper).text()).toBe('Hiện');
    expect(submitButton(wrapper).text()).toBe('Đặt lại mật khẩu');
    expect(submitButton(wrapper).element.disabled).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('keeps the button disabled and shows "Mật khẩu chưa khớp" under the second field when they differ', async () => {
    const wrapper = await mountView();

    await fill(wrapper, '1234567890', '12345678');

    const confirmError = wrapper.get(`#${confirmInput(wrapper).attributes('aria-describedby')}`);
    expect(confirmError.text()).toBe('Mật khẩu chưa khớp');
    expect(confirmInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(passwordInput(wrapper).attributes('aria-invalid')).toBeUndefined();
    expect(submitButton(wrapper).element.disabled).toBe(true);
  });

  it('shows the length error for a 7-character password and keeps the button disabled', async () => {
    const wrapper = await mountView();

    await fill(wrapper, '1234567', '1234567');

    expect(wrapper.text()).toContain('Mật khẩu cần ít nhất 8 ký tự');
    expect(wrapper.text()).not.toContain(copy.passwordHelper);
    expect(passwordInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(submitButton(wrapper).element.disabled).toBe(true);
  });

  it('shows the length error for a password over 128 characters', async () => {
    const wrapper = await mountView();
    const long = 'a'.repeat(129);

    await fill(wrapper, long, long);

    expect(wrapper.text()).toContain(copy.errors.PASSWORD_TOO_LONG);
    expect(submitButton(wrapper).element.disabled).toBe(true);
  });

  it('does not flag a short password while it is still being typed', async () => {
    const wrapper = await mountView();

    await passwordInput(wrapper).setValue('123');

    expect(wrapper.text()).not.toContain(copy.errors.PASSWORD_TOO_SHORT);
    expect(wrapper.text()).toContain(copy.passwordHelper);
  });

  it('enables the button once both are valid and match, and clears the mismatch', async () => {
    const wrapper = await mountView();
    await fill(wrapper, '12345678', '1234567x');
    expect(wrapper.text()).toContain(copy.errors.PASSWORD_MISMATCH);

    await confirmInput(wrapper).setValue('12345678');

    expect(wrapper.text()).not.toContain(copy.errors.PASSWORD_MISMATCH);
    expect(submitButton(wrapper).element.disabled).toBe(false);
  });

  it('sends nothing when the form is submitted while invalid', async () => {
    const wrapper = await mountView();
    await fill(wrapper, '12345678', '87654321');

    await submit(wrapper);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('toggles each field between hidden and visible with its own named button', async () => {
    const wrapper = await mountView();

    await passwordToggle(wrapper).trigger('click');

    expect(passwordInput(wrapper).attributes('type')).toBe('text');
    expect(confirmInput(wrapper).attributes('type')).toBe('password');
    expect(passwordToggle(wrapper).text()).toBe(copy.hide);
    expect(passwordToggle(wrapper).attributes('aria-label')).toBe(copy.hideNewPassword);
    expect(passwordToggle(wrapper).attributes('aria-controls')).toBe(
      passwordInput(wrapper).attributes('id'),
    );
    expect(passwordToggle(wrapper).attributes('type')).toBe('button');

    await confirmToggle(wrapper).trigger('click');

    expect(confirmInput(wrapper).attributes('type')).toBe('text');
    expect(confirmToggle(wrapper).attributes('aria-label')).toBe(copy.hideConfirmPassword);
    expect(confirmToggle(wrapper).attributes('aria-controls')).toBe(
      confirmInput(wrapper).attributes('id'),
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  describe('a valid reset', () => {
    it('sends the token and the new password, then shows the REC-04 confirmation', async () => {
      fetchFn.mockResolvedValue(resetDone());
      const wrapper = await mountView();

      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      expect(fetchFn).toHaveBeenCalledOnce();
      const call = await callAt();
      expect(new URL(call.url).pathname).toBe('/api/auth/reset-password');
      expect(call.body).toEqual({ token, newPassword: 'new-pass-123' });

      expect(wrapper.get('h1').text()).toBe('Đã đặt lại mật khẩu');
      expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
        'Bạn có thể đăng nhập bằng mật khẩu mới.',
      );
      const notice = wrapper.get('[data-testid="reset-password-done-notice"]');
      expect(notice.text()).toBe('Mật khẩu đã được cập nhật.');
      expect(notice.attributes('role')).toBe('status');
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.get('[data-testid="reset-password-sign-in"]').text()).toBe('Đăng nhập');
    });

    it('"Đăng nhập" opens /sign-in', async () => {
      fetchFn.mockResolvedValue(resetDone());
      const wrapper = await mountView();
      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      await wrapper.get('[data-testid="reset-password-sign-in"]').trigger('click');

      await arrivedAt('/sign-in');
      expect(router.currentRoute.value.query).toEqual({});
    });

    it('passes the email on to /sign-in when the link carries it', async () => {
      fetchFn.mockResolvedValue(resetDone());
      const wrapper = await mountView(
        `${RESET_PASSWORD_PATH}?token=${token}&email=minh.anh%40example.test`,
      );
      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      await wrapper.get('[data-testid="reset-password-sign-in"]').trigger('click');

      await arrivedAt('/sign-in');
      expect(router.currentRoute.value.query).toEqual({ email: 'minh.anh@example.test' });
    });

    it('disables the form while the request is pending and sends it once', async () => {
      let answer: (response: Response) => void = () => {};
      fetchFn.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
      const wrapper = await mountView();
      await fill(wrapper, 'new-pass-123', 'new-pass-123');

      await submit(wrapper);

      expect(submitButton(wrapper).attributes('aria-busy')).toBe('true');
      expect(passwordInput(wrapper).element.disabled).toBe(true);
      expect(confirmInput(wrapper).element.disabled).toBe(true);
      expect(passwordToggle(wrapper).element.disabled).toBe(true);
      expect(confirmToggle(wrapper).element.disabled).toBe(true);

      await submit(wrapper);
      await submitButton(wrapper).trigger('click');
      await flushPromises();
      expect(fetchFn).toHaveBeenCalledOnce();

      answer(resetDone());
      await flushPromises();
      expect(wrapper.get('h1').text()).toBe(copy.done.title);
    });
  });

  describe('when the request fails', () => {
    it('goes to the invalid-link page for an invalid or expired token', async () => {
      fetchFn.mockResolvedValue(invalidToken());
      const wrapper = await mountView();

      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      await arrivedAt(RESET_PASSWORD_INVALID_PATH);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });

    it('shows the translated network error and keeps the form', async () => {
      fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
      const wrapper = await mountView();

      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      expect(wrapper.get('[data-testid="reset-password-error"]').text()).toBe(
        viMessages.errors.NETWORK_ERROR,
      );
      expect(router.currentRoute.value.path).toBe(RESET_PASSWORD_PATH);
      expect(passwordInput(wrapper).element.value).toBe('new-pass-123');
      expect(passwordInput(wrapper).element.disabled).toBe(false);
      expect(submitButton(wrapper).attributes('aria-busy')).toBeUndefined();
    });

    it('shows the translated server length error', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' }, 400),
      );
      const wrapper = await mountView();

      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      expect(wrapper.get('[data-testid="reset-password-error"]').text()).toBe(
        copy.errors.PASSWORD_TOO_SHORT,
      );
    });

    it('shows the generic error for a code the app has no text for, never the API message', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ code: 'SOMETHING_ODD', message: 'Raw hint' }, 500));
      const wrapper = await mountView();

      await fill(wrapper, 'new-pass-123', 'new-pass-123');
      await submit(wrapper);

      expect(wrapper.get('[data-testid="reset-password-error"]').text()).toBe(
        viMessages.errors.unknown,
      );
      expect(wrapper.text()).not.toContain('Raw hint');
    });
  });

  it('has the English copy after switching to EN', async () => {
    fetchFn.mockResolvedValue(resetDone());
    const wrapper = await mountView();
    const copyEn = en.auth.resetPassword;

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.get('h1').text()).toBe(copyEn.title);
    expect(wrapper.text()).toContain(copyEn.subtitle);
    const labels = wrapper.findAll('label').map((label) => label.text().replace('*', ''));
    expect(labels).toEqual([copyEn.newPassword, copyEn.confirmPassword]);
    expect(wrapper.text()).toContain(copyEn.passwordHelper);
    expect(passwordToggle(wrapper).text()).toBe(copyEn.show);
    expect(submitButton(wrapper).text()).toBe(copyEn.submit);

    await fill(wrapper, '1234567', '7654321');
    expect(wrapper.text()).toContain(copyEn.errors.PASSWORD_TOO_SHORT);
    expect(wrapper.text()).toContain(copyEn.errors.PASSWORD_MISMATCH);

    await fill(wrapper, 'new-pass-123', 'new-pass-123');
    await submit(wrapper);
    expect(wrapper.get('h1').text()).toBe(copyEn.done.title);
    expect(wrapper.text()).toContain(copyEn.done.subtitle);
    expect(wrapper.text()).toContain(copyEn.done.notice);
    expect(wrapper.get('[data-testid="reset-password-sign-in"]').text()).toBe(copyEn.done.signIn);
  });
});
