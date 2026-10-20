import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { buildRoutes, stringifyQuery } from '../../router';
import CheckEmailView from './CheckEmailView.vue';

const EMAIL = 'minh.anh@example.test';
const PAGE = `/verify-email?email=${encodeURIComponent(EMAIL)}`;
const copy = viMessages.auth.checkEmail;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestOf(call: Parameters<typeof fetch>) {
  const [input, init] = call;
  return input instanceof Request ? input : new Request(input, init);
}

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;

function appRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: buildRoutes(false),
    stringifyQuery,
  });
}

async function mountAt(path: string) {
  const router = appRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(CheckEmailView, { global: { plugins: [router, i18n] } });
  return { router, wrapper };
}

type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper'];

const resendButton = (wrapper: Wrapper) => wrapper.get('[data-testid="check-email-resend"]');

/** Lets the first 60 s wait run out so the button can be clicked. */
async function waitOutFirstCountdown() {
  vi.advanceTimersByTime(60_000);
  await flushPromises();
}

describe('CheckEmailView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-20T08:00:00.000Z') });
    setLocale('vi');
    fetchFn = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchFn);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setLocale('vi');
    localStorage.clear();
  });

  describe('route', () => {
    it('is the page at /verify-email', async () => {
      const { router } = await mountAt(PAGE);

      expect(router.currentRoute.value.name).toBe('verify-email');
      expect(router.currentRoute.value.matched[0]?.components?.default).toBeDefined();
    });

    it('sends a visit without an email to /sign-up', async () => {
      const router = appRouter();

      await router.push('/verify-email');
      expect(router.currentRoute.value.fullPath).toBe('/sign-up');

      await router.push('/verify-email?email=');
      expect(router.currentRoute.value.fullPath).toBe('/sign-up');
    });

    it('leaves the verification link landing pages under /verify-email/… to their own route', async () => {
      const router = appRouter();
      await router.push('/verify-email/success');

      expect(router.currentRoute.value.fullPath).toBe('/verify-email/success');
      expect(router.currentRoute.value.name).not.toBe('verify-email');
    });
  });

  it('shows the AUTH-03 content with the address read-only under "Người nhận"', async () => {
    const { wrapper } = await mountAt(PAGE);

    expect(wrapper.get('h1').text()).toBe(copy.title);
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(copy.subtitle);

    const field = wrapper.get('input');
    expect(field.element.value).toBe(EMAIL);
    expect(field.attributes('readonly')).toBeDefined();
    expect(wrapper.get(`label[for="${field.attributes('id')}"]`).text()).toContain(copy.recipient);

    const notice = wrapper.get('[data-testid="check-email-notice"]');
    expect(notice.classes()).toContain('ats-notice--info');
    expect(notice.text()).toContain(copy.notice);

    const footer = wrapper.get('.auth-layout__footer');
    expect(footer.text()).toContain(copy.wrongEmail);
    expect(footer.get('a').text()).toBe(copy.backToSignUp);
    expect(footer.get('a').attributes('href')).toBe('/sign-up');
  });

  it('starts with the resend button disabled for 60 s with a countdown, then enables it', async () => {
    const { wrapper } = await mountAt(PAGE);

    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 60 giây');

    vi.advanceTimersByTime(15_000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 45 giây');
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();

    vi.advanceTimersByTime(45_000);
    await flushPromises();
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined();
    expect(resendButton(wrapper).text()).toBe(copy.resend);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('resends to the address and switches to the AUTH-04 state with a new 60 s wait', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ status: true }));
    const { wrapper } = await mountAt(PAGE);
    await waitOutFirstCountdown();

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const request = requestOf(fetchFn.mock.calls[0]!);
    expect(request.method).toBe('POST');
    expect(new URL(request.url).pathname).toBe('/api/auth/send-verification-email');
    expect(await request.json()).toMatchObject({ email: EMAIL });

    expect(wrapper.get('h1').text()).toBe(copy.resentTitle);
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(copy.resentSubtitle);
    const notice = wrapper.get('[data-testid="check-email-notice"]');
    expect(notice.classes()).toContain('ats-notice--success');
    expect(notice.text()).toContain(copy.resentNotice);
    expect(wrapper.get('.auth-layout__footer').text()).toBe(copy.resentFooter);
    expect(wrapper.get('input').element.value).toBe(EMAIL);

    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 60 giây');

    vi.advanceTimersByTime(60_000);
    await flushPromises();
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined();
    expect(resendButton(wrapper).text()).toBe(copy.resendAgain);
  });

  it('restarts the countdown from retryAfterSeconds on RESEND_TOO_SOON', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ code: 'RESEND_TOO_SOON', message: 'wait', retryAfterSeconds: 42 }, 429),
    );
    const { wrapper } = await mountAt(PAGE);
    await waitOutFirstCountdown();

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();
    expect(resendButton(wrapper).text()).toBe('Gửi lại sau 42 giây');
    expect(wrapper.get('h1').text()).toBe(copy.title);

    vi.advanceTimersByTime(42_000);
    await flushPromises();
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('shows the translated limit message on RESEND_LIMIT and keeps the button disabled', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ code: 'RESEND_LIMIT', message: 'dev hint', retryAfterSeconds: 3_300 }, 429),
    );
    const { wrapper } = await mountAt(PAGE);
    await waitOutFirstCountdown();

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    const notice = wrapper.get('[data-testid="check-email-notice"]');
    expect(notice.classes()).toContain('ats-notice--error');
    expect(notice.attributes('role')).toBe('alert');
    expect(notice.text()).toContain(viMessages.errors.RESEND_LIMIT);
    expect(notice.text()).not.toContain('dev hint');
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();

    vi.advanceTimersByTime(2 * 60 * 60_000);
    await flushPromises();
    expect(resendButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('shows any other failure as a translated error and lets the user try again', async () => {
    fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const { wrapper } = await mountAt(PAGE);
    await waitOutFirstCountdown();

    await resendButton(wrapper).trigger('click');
    await flushPromises();

    const notice = wrapper.get('[data-testid="check-email-notice"]');
    expect(notice.classes()).toContain('ats-notice--error');
    expect(notice.text()).toContain(viMessages.errors.NETWORK_ERROR);
    expect(resendButton(wrapper).attributes('disabled')).toBeUndefined();
  });

  it('announces the wait politely once, not every second, and announces when resend is ready', async () => {
    const { wrapper } = await mountAt(PAGE);
    const live = wrapper.get('[data-testid="check-email-countdown-status"]');

    expect(live.attributes('aria-live')).toBe('polite');
    expect(live.text()).toBe('Bạn có thể gửi lại email sau 60 giây.');
    expect(resendButton(wrapper).attributes('aria-live')).toBeUndefined();

    vi.advanceTimersByTime(15_000);
    await flushPromises();
    expect(live.text()).toBe('Bạn có thể gửi lại email sau 60 giây.');

    vi.advanceTimersByTime(45_000);
    await flushPromises();
    expect(live.text()).toBe(copy.readyAnnouncement);
  });

  it('switches to English with the language switch', async () => {
    const { wrapper } = await mountAt(PAGE);

    await wrapper.findAll('[role="group"] button')[1]!.trigger('click');

    expect(wrapper.get('h1').text()).toBe(en.auth.checkEmail.title);
    expect(resendButton(wrapper).text()).toBe('Resend in 60 s');
  });
});
