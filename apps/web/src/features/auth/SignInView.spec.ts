import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import { useSessionStore } from './session.store';
import SignInView from './SignInView.vue';

const copy = viMessages.auth.signIn;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const user = {
  id: 'u1',
  email: 'minh.anh@example.test',
  name: 'Minh Anh',
  emailVerified: true,
  locale: 'vi',
};

const signedIn = () => jsonResponse({ redirect: false, token: 'session-token', user });
const me = () => jsonResponse({ user });
const invalidCredentials = () =>
  jsonResponse({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
const rateLimited = (retryAfterSeconds?: number) =>
  jsonResponse({ code: 'SIGN_IN_RATE_LIMITED', message: 'Too many', retryAfterSeconds }, 429);

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;

function requestOf(index: number): Request {
  const [input, init] = fetchFn.mock.calls[index]!;
  return input instanceof Request ? input : new Request(input, init);
}

/** Paths of every request sent so far. */
function paths(): string[] {
  return fetchFn.mock.calls.map((_, index) => new URL(requestOf(index).url).pathname);
}

/** Answers `GET /api/me` with the signed-in user and every other call with `signIn()`. */
function answer(signIn: () => Response | Promise<Response>) {
  fetchFn.mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.endsWith('/me') ? me() : signIn();
  });
}

async function mountView(path = '/sign-in') {
  await router.push(path);
  await router.isReady();
  return mount(SignInView, {
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  });
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const emailInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="sign-in-email"]');
const passwordInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="sign-in-password"]');
const toggle = (w: Wrapper) => w.get<HTMLButtonElement>('[data-testid="sign-in-password-toggle"]');
const submitButton = (w: Wrapper) => w.get('button[type="submit"]');
const switchToEnglish = (w: Wrapper) => w.findAll('[role="group"] button')[1]!.trigger('click');

async function fill(w: Wrapper, email = 'minh.anh@example.test', password = 'secret-pass-1') {
  await emailInput(w).setValue(email);
  await passwordInput(w).setValue(password);
}

async function submit(w: Wrapper) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

/** Waits for the navigation to finish: the target route's component is loaded lazily. */
async function arrivedAt(fullPath: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe(fullPath));
}

beforeEach(() => {
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  setActivePinia(pinia);
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('SignInView', () => {
  it('is the page at /sign-in', async () => {
    await router.push('/sign-in');
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router, pinia] } });
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows the SIGN-01 form with the password toggle and the footer links', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe(copy.title);
    expect(wrapper.text()).toContain(copy.subtitle);
    const labels = wrapper.findAll('label').map((label) => label.text().replace('*', ''));
    expect(labels).toEqual([copy.email, copy.password]);
    expect(emailInput(wrapper).attributes('type')).toBe('email');
    expect(emailInput(wrapper).attributes('autocomplete')).toBe('email');
    expect(passwordInput(wrapper).attributes('type')).toBe('password');
    expect(passwordInput(wrapper).attributes('autocomplete')).toBe('current-password');
    expect(toggle(wrapper).text()).toBe(copy.show);
    expect(submitButton(wrapper).text()).toBe(copy.submit);
    expect(wrapper.get('[data-testid="sign-in-forgot-link"]').attributes('href')).toBe(
      '/forgot-password',
    );
    expect(wrapper.get('[data-testid="sign-in-sign-up-link"]').attributes('href')).toBe('/sign-up');
    const footer = wrapper.get('footer').text().replace(/\s+/g, ' ');
    expect(footer).toBe(`${copy.forgotPassword} · ${copy.noAccount} ${copy.signUp}`);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('shows no Google, Microsoft or passkey buttons and no "or" divider', async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'VI',
      'EN',
      copy.show,
      copy.submit,
    ]);
    expect(wrapper.text()).not.toMatch(/Google|Microsoft|passkey|hoặc/i);
  });

  it('toggles the password between hidden and visible without submitting', async () => {
    const wrapper = await mountView();
    await passwordInput(wrapper).setValue('secret-pass-1');

    await toggle(wrapper).trigger('click');

    expect(passwordInput(wrapper).attributes('type')).toBe('text');
    expect(toggle(wrapper).text()).toBe(copy.hide);
    expect(toggle(wrapper).attributes('type')).toBe('button');
    expect(toggle(wrapper).attributes('aria-label')).toBe(copy.hidePassword);
    expect(toggle(wrapper).attributes('aria-controls')).toBe(
      passwordInput(wrapper).attributes('id'),
    );

    await toggle(wrapper).trigger('click');

    expect(passwordInput(wrapper).attributes('type')).toBe('password');
    expect(toggle(wrapper).attributes('aria-label')).toBe(copy.showPassword);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('asks for the email and password when they are empty and sends nothing', async () => {
    const wrapper = await mountView();

    await submit(wrapper);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(copy.errors.EMAIL_REQUIRED);
    expect(wrapper.text()).toContain(copy.errors.PASSWORD_REQUIRED);
    expect(document.activeElement).toBe(emailInput(wrapper).element);

    await emailInput(wrapper).setValue('minh.anh@example.test');

    expect(wrapper.text()).not.toContain(copy.errors.EMAIL_REQUIRED);
    expect(wrapper.text()).toContain(copy.errors.PASSWORD_REQUIRED);
  });

  describe('expired=1', () => {
    it('shows the session-expired info notice above the form', async () => {
      const wrapper = await mountView('/sign-in?redirect=%2Fjobs&expired=1');

      const notice = wrapper.get('[data-testid="sign-in-expired"]');
      expect(notice.attributes('role')).toBe('status');
      expect(notice.text()).toBe('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');
      const html = wrapper.html();
      expect(html.indexOf('sign-in-expired')).toBeLessThan(html.indexOf('sign-in-email'));
    });

    it('is in English after switching to EN', async () => {
      const wrapper = await mountView('/sign-in?expired=1');

      await switchToEnglish(wrapper);

      expect(wrapper.get('[data-testid="sign-in-expired"]').text()).toBe(en.auth.signIn.expired);
    });

    it('is not shown without expired=1', async () => {
      const wrapper = await mountView('/sign-in?expired=0');

      expect(wrapper.find('[data-testid="sign-in-expired"]').exists()).toBe(false);
    });
  });

  describe('a successful sign-in', () => {
    it('sends the trimmed email and the password, loads the session and lands on /', async () => {
      answer(signedIn);
      const wrapper = await mountView();

      await fill(wrapper, ' minh.anh@example.test ', 'secret-pass-1');
      await submit(wrapper);

      await arrivedAt('/');
      expect(paths()).toEqual(['/api/auth/sign-in/email', '/api/me']);
      const body = (await requestOf(0).clone().json()) as Record<string, unknown>;
      expect(body).toMatchObject({ email: 'minh.anh@example.test', password: 'secret-pass-1' });
      expect(useSessionStore(pinia).isSignedIn).toBe(true);
    });

    it('follows a same-origin redirect', async () => {
      answer(signedIn);
      const wrapper = await mountView('/sign-in?redirect=%2Fjobs%3Fstatus%3Dopen');

      await fill(wrapper);
      await submit(wrapper);

      await arrivedAt('/jobs?status=open');
    });

    it.each([
      ['an absolute URL', 'https%3A%2F%2Fevil.example'],
      ['a protocol-relative URL', '%2F%2Fevil.example'],
    ])('ignores %s in redirect and lands on /', async (_, redirect) => {
      answer(signedIn);
      const wrapper = await mountView(`/sign-in?redirect=${redirect}`);

      await fill(wrapper);
      await submit(wrapper);

      await arrivedAt('/');
    });

    it('shows the SIGN-02 state while signing in and sends one request for repeated submits', async () => {
      let release: (response: Response) => void = () => {};
      answer(() => new Promise<Response>((resolve) => (release = resolve)));
      const wrapper = await mountView();
      await fill(wrapper);

      await submit(wrapper);

      expect(submitButton(wrapper).attributes('aria-busy')).toBe('true');
      expect(submitButton(wrapper).text()).toBe(copy.submitPending);
      expect(wrapper.get('h1').text()).toBe(copy.pendingTitle);
      expect(wrapper.text()).toContain(copy.pendingSubtitle);
      expect(wrapper.get('[role="status"]').text()).toBe(copy.pendingNotice);

      await submit(wrapper);
      await submitButton(wrapper).trigger('click');
      await flushPromises();
      expect(paths()).toEqual(['/api/auth/sign-in/email']);

      release(signedIn());
      await arrivedAt('/');
    });
  });

  describe('when signing in fails', () => {
    it('shows the SIGN-03 state for a wrong password, keeps the email and clears the password', async () => {
      answer(invalidCredentials);
      const wrapper = await mountView();

      await fill(wrapper, 'minh.anh@example.test', 'wrong-pass-1');
      await submit(wrapper);

      expect(wrapper.get('h1').text()).toBe(copy.failedTitle);
      expect(wrapper.text()).toContain(copy.failedSubtitle);
      expect(wrapper.get('[role="alert"]').text()).toBe('Email hoặc mật khẩu chưa đúng.');
      expect(submitButton(wrapper).text()).toBe(copy.retry);
      expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
      expect(passwordInput(wrapper).element.value).toBe('');
      expect(document.activeElement).toBe(passwordInput(wrapper).element);
      expect(router.currentRoute.value.path).toBe('/sign-in');
      expect(paths()).toEqual(['/api/auth/sign-in/email']);
      // The error does not flag the emptied password as missing.
      expect(wrapper.text()).not.toContain(copy.errors.PASSWORD_REQUIRED);
      // The notice sits above the fields, as in SIGN-03.
      const html = wrapper.html();
      expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('sign-in-email'));
    });

    it('shows the not-verified message with a link to resend the verification email', async () => {
      answer(() =>
        jsonResponse({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 403),
      );
      const wrapper = await mountView();

      await fill(wrapper, 'chua.xac.minh@example.test');
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toContain(viMessages.errors.EMAIL_NOT_VERIFIED);
      const link = wrapper.get('[data-testid="sign-in-verify-link"]');
      expect(link.text()).toBe(copy.resendVerification);
      expect(link.attributes('href')).toBe('/verify-email?email=chua.xac.minh%40example.test');
    });

    it.each([
      [600, 10],
      [61, 2],
      [1, 1],
    ])('shows the blocked message for retryAfterSeconds %i as %i minutes', async (seconds, n) => {
      answer(() => rateLimited(seconds));
      const wrapper = await mountView();

      await fill(wrapper);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(
        `Bạn đã đăng nhập sai quá nhiều lần. Thử lại sau ${n} phút.`,
      );
    });

    it.each([
      [600, 'Too many failed sign-ins. Try again in 10 minutes.'],
      [30, 'Too many failed sign-ins. Try again in 1 minute.'],
    ])('shows the blocked message for %i seconds in English', async (seconds, text) => {
      answer(() => rateLimited(seconds));
      const wrapper = await mountView();
      await switchToEnglish(wrapper);

      await fill(wrapper);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(text);
    });

    it('falls back to the generic blocked text when retryAfterSeconds is missing', async () => {
      answer(() => rateLimited());
      const wrapper = await mountView();

      await fill(wrapper);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.SIGN_IN_RATE_LIMITED);
    });

    it('shows the network error and keeps the form', async () => {
      fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
      const wrapper = await mountView();

      await fill(wrapper);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.NETWORK_ERROR);
      expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
      expect(passwordInput(wrapper).element.value).toBe('secret-pass-1');
      expect(submitButton(wrapper).attributes('aria-busy')).toBeUndefined();
      expect(router.currentRoute.value.path).toBe('/sign-in');
    });

    it('never shows the API message for a code without text', async () => {
      answer(() => jsonResponse({ code: 'SOMETHING_ODD', message: 'Raw hint' }, 500));
      const wrapper = await mountView();

      await fill(wrapper);
      await submit(wrapper);

      expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.unknown);
      expect(wrapper.text()).not.toContain('Raw hint');
    });

    it('signs in on retry after a wrong password', async () => {
      let attempt = 0;
      answer(() => (attempt++ === 0 ? invalidCredentials() : signedIn()));
      const wrapper = await mountView('/sign-in?redirect=%2Fjobs');

      await fill(wrapper, 'minh.anh@example.test', 'wrong-pass-1');
      await submit(wrapper);
      await passwordInput(wrapper).setValue('secret-pass-1');
      await submit(wrapper);

      await arrivedAt('/jobs');
    });
  });

  it('has the English copy after switching to EN', async () => {
    const wrapper = await mountView();

    await switchToEnglish(wrapper);

    expect(wrapper.get('h1').text()).toBe(en.auth.signIn.title);
    expect(submitButton(wrapper).text()).toBe(en.auth.signIn.submit);
    expect(toggle(wrapper).text()).toBe(en.auth.signIn.show);
    expect(wrapper.get('footer').text()).toContain(en.auth.signIn.forgotPassword);
  });
});
