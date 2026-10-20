import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import SignUpView from './SignUpView.vue';

const copy = viMessages.auth.signUp;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const signedUp = () =>
  jsonResponse({ token: null, user: { id: 'u1', email: 'minh.anh@example.test', name: 'Minh' } });

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;

/** URL and parsed JSON body of the n-th fetch call. */
async function callAt(index = 0) {
  const [input, init] = fetchFn.mock.calls[index]!;
  const request = input instanceof Request ? input : new Request(input, init);
  const text = await request.clone().text();
  return { url: request.url, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
}

async function mountView() {
  await router.push('/sign-up');
  await router.isReady();
  return mount(SignUpView, { global: { plugins: [i18n, router] }, attachTo: document.body });
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const nameInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="sign-up-name"]');
const emailInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="sign-up-email"]');
const passwordInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="sign-up-password"]');
const toggle = (w: Wrapper) => w.get<HTMLButtonElement>('[data-testid="sign-up-password-toggle"]');
const submitButton = (w: Wrapper) => w.get('button[type="submit"]');

async function fill(w: Wrapper, values: { name?: string; email?: string; password?: string }) {
  if (values.name !== undefined) await nameInput(w).setValue(values.name);
  if (values.email !== undefined) await emailInput(w).setValue(values.email);
  if (values.password !== undefined) await passwordInput(w).setValue(values.password);
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

describe('SignUpView', () => {
  it('is the page at /sign-up', async () => {
    await router.push('/sign-up');
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the AUTH-01 form with a name field, the password helper and toggle, and the sign-in link', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe(copy.title);
    expect(wrapper.text()).toContain(copy.subtitle);
    const labels = wrapper.findAll('label').map((label) => label.text().replace('*', ''));
    expect(labels).toEqual([copy.name, copy.email, copy.password]);
    expect(nameInput(wrapper).attributes('autocomplete')).toBe('name');
    expect(emailInput(wrapper).attributes('type')).toBe('email');
    expect(emailInput(wrapper).attributes('autocomplete')).toBe('email');
    expect(passwordInput(wrapper).attributes('type')).toBe('password');
    expect(passwordInput(wrapper).attributes('autocomplete')).toBe('new-password');
    expect(wrapper.text()).toContain(copy.passwordHelper);
    expect(toggle(wrapper).text()).toBe(copy.show);
    expect(submitButton(wrapper).text()).toBe(copy.submit);
    expect(wrapper.get('[data-testid="sign-up-sign-in-link"]').attributes('href')).toBe('/sign-in');
    expect(wrapper.get('footer').text()).toBe(`${copy.haveAccount} ${copy.signIn}`);
  });

  it('shows no Google, Microsoft or passkey buttons and no "or" divider', async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'VI',
      'EN',
      copy.show,
      copy.submit,
    ]);
    // The subtitle keeps the design copy; the form itself has no provider or divider text.
    expect(wrapper.get('form').text()).not.toMatch(/Google|Microsoft|passkey|hoặc/i);
  });

  it('flags an incomplete email and a 4-character password with the error notice and sends nothing (AUTH-02)', async () => {
    const wrapper = await mountView();

    await fill(wrapper, { name: 'Minh Anh', email: 'minh.anh@', password: '1234' });
    await submit(wrapper);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Nhập địa chỉ email hợp lệ');
    expect(wrapper.text()).toContain('Mật khẩu cần ít nhất 8 ký tự');
    expect(emailInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(passwordInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(nameInput(wrapper).attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Chưa thể tạo tài khoản. Kiểm tra thông tin phía trên.',
    );
    expect(wrapper.text()).toContain(copy.subtitleInvalid);
    expect(wrapper.text()).not.toContain(copy.subtitle);
    // The error takes the helper's place under the password.
    expect(wrapper.text()).not.toContain(copy.passwordHelper);
    expect(document.activeElement).toBe(emailInput(wrapper).element);
    expect(router.currentRoute.value.path).toBe('/sign-up');
  });

  it('asks for a name when it is empty or only spaces', async () => {
    const wrapper = await mountView();

    await fill(wrapper, { name: '   ', email: 'minh.anh@example.test', password: '12345678' });
    await submit(wrapper);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(copy.errors.NAME_REQUIRED);
    expect(document.activeElement).toBe(nameInput(wrapper).element);
  });

  it('clears a field error once the field is fixed, and the notice once all are', async () => {
    const wrapper = await mountView();
    await fill(wrapper, { name: 'Minh Anh', email: 'minh.anh@', password: '1234' });
    await submit(wrapper);

    await emailInput(wrapper).setValue('minh.anh@example.test');

    expect(wrapper.text()).not.toContain(copy.errors.EMAIL_INVALID);
    expect(wrapper.text()).toContain(copy.errors.PASSWORD_TOO_SHORT);

    await passwordInput(wrapper).setValue('12345678');

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(copy.subtitle);
  });

  describe('show password', () => {
    it('toggles the password between hidden and visible', async () => {
      const wrapper = await mountView();
      await fill(wrapper, { password: 'secret-pass' });

      await toggle(wrapper).trigger('click');

      expect(passwordInput(wrapper).attributes('type')).toBe('text');
      expect(toggle(wrapper).text()).toBe(copy.hide);
      expect(passwordInput(wrapper).element.value).toBe('secret-pass');

      await toggle(wrapper).trigger('click');

      expect(passwordInput(wrapper).attributes('type')).toBe('password');
      expect(toggle(wrapper).text()).toBe(copy.show);
    });

    it('is a focusable native button that names its action and does not submit the form', async () => {
      const wrapper = await mountView();
      const button = toggle(wrapper);

      expect(button.element.tagName).toBe('BUTTON');
      expect(button.attributes('type')).toBe('button');
      expect(button.attributes('tabindex')).toBeUndefined();
      expect(button.attributes('aria-controls')).toBe(passwordInput(wrapper).attributes('id'));
      expect(button.attributes('aria-label')).toBe(copy.showPassword);
      button.element.focus();
      expect(document.activeElement).toBe(button.element);

      await button.trigger('click');

      expect(button.attributes('aria-label')).toBe(copy.hidePassword);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('a valid sign-up', () => {
    const values = { name: '  Minh Anh ', email: ' minh.anh@example.test ', password: '12345678' };

    it('sends the trimmed name and email, the password and the UI locale, then opens the check-email page', async () => {
      fetchFn.mockResolvedValue(signedUp());
      const wrapper = await mountView();

      await fill(wrapper, values);
      await submit(wrapper);

      expect(fetchFn).toHaveBeenCalledOnce();
      const call = await callAt();
      expect(new URL(call.url).pathname).toBe('/api/auth/sign-up/email');
      expect(call.body).toMatchObject({
        name: 'Minh Anh',
        email: 'minh.anh@example.test',
        password: '12345678',
        locale: 'vi',
      });
      await arrivedAt('/verify-email');
      expect(router.currentRoute.value.query).toEqual({ email: 'minh.anh@example.test' });
    });

    it('sends locale "en" after switching to EN', async () => {
      fetchFn.mockResolvedValue(signedUp());
      const wrapper = await mountView();

      await wrapper.findAll('[role="group"] button')[1]!.trigger('click');
      expect(wrapper.get('h1').text()).toBe(en.auth.signUp.title);
      await fill(wrapper, values);
      await submit(wrapper);

      expect((await callAt()).body).toMatchObject({ locale: 'en' });
    });

    it('shows the pending button and sends one request when submitted again meanwhile', async () => {
      let answer: (response: Response) => void = () => {};
      fetchFn.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
      const wrapper = await mountView();
      await fill(wrapper, values);

      await submit(wrapper);
      expect(submitButton(wrapper).attributes('aria-busy')).toBe('true');
      await submit(wrapper);
      await submitButton(wrapper).trigger('click');
      await flushPromises();

      expect(fetchFn).toHaveBeenCalledOnce();

      answer(signedUp());
      await arrivedAt('/verify-email');
    });

    it('treats an already registered email like a new one', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse(
          { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists' },
          422,
        ),
      );
      const wrapper = await mountView();

      await fill(wrapper, values);
      await submit(wrapper);

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await arrivedAt('/verify-email');
      expect(router.currentRoute.value.fullPath).toBe(
        '/verify-email?email=minh.anh%40example.test',
      );
    });
  });

  describe('when the request fails', () => {
    const values = { name: 'Minh Anh', email: 'minh.anh@example.test', password: '12345678' };

    it('shows the translated network error and keeps the form', async () => {
      fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
      const wrapper = await mountView();

      await fill(wrapper, values);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.NETWORK_ERROR);
      expect(router.currentRoute.value.path).toBe('/sign-up');
      expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
      expect(submitButton(wrapper).attributes('aria-busy')).toBeUndefined();
    });

    it('shows the generic error for a code the app has no text for, never the API message', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ code: 'SOMETHING_ODD', message: 'Raw hint' }, 500));
      const wrapper = await mountView();

      await fill(wrapper, values);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.unknown);
      expect(wrapper.text()).not.toContain('Raw hint');
    });
  });

  it('has the English copy after switching to EN', async () => {
    const wrapper = await mountView();

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.text()).toContain(en.auth.signUp.subtitle);
    expect(toggle(wrapper).text()).toBe(en.auth.signUp.show);
    expect(submitButton(wrapper).text()).toBe(en.auth.signUp.submit);
  });
});
