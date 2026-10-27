import type { MeUser } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useSessionStore } from '../features/auth/session.store';
import { registerWorkspaceCache } from '../features/workspaces/workspace-cache';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';
import { getLocale, i18n, setLocale } from '../i18n';
import { initTheme, THEME_ATTRIBUTE } from '../lib/theme';
import AccountMenu from './AccountMenu.vue';

const user: MeUser = {
  id: 'user-1',
  name: 'Minh Anh',
  email: 'minh.anh@example.test',
  locale: 'vi',
  emailVerified: true,
};

const Page = defineComponent({ render: () => h('div') });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlOf(input: RequestInfo | URL): string {
  return String(input instanceof Request ? input.url : input);
}

let pinia: Pinia;
let router: Router;
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
/** Answers for Better Auth calls, by path suffix. */
let answers: Record<string, () => Response>;
const mounted: { unmount(): void }[] = [];

async function mountMenu(attachTo: HTMLElement = document.body) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: ['/jobs', '/settings/personal', '/sign-in'].map((path) => ({ path, component: Page })),
  });
  await router.push('/jobs');
  await router.isReady();
  const wrapper = mount(AccountMenu, {
    global: { plugins: [router, pinia, i18n] },
    attachTo,
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>('[data-testid="account-menu-trigger"]')!;
const panel = () => document.querySelector<HTMLElement>('[role="menu"]');
const items = () => [
  ...(panel()?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []),
];
const itemNamed = (label: string) => items().find((item) => item.textContent?.trim() === label)!;

async function open() {
  trigger().click();
  await flushPromises();
}

function calls(suffix: string) {
  return fetchFn.mock.calls.filter(([input]) => urlOf(input).endsWith(suffix));
}

beforeEach(() => {
  setLocale('vi');
  initTheme({ storage: null, matchMedia: null, root: document.documentElement });
  pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().user = { ...user };
  useSessionStore().status = 'signed-in';
  answers = {
    '/api/auth/update-user': () => jsonResponse({ status: true }),
    '/api/auth/sign-out': () => jsonResponse({ success: true }),
  };
  fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = urlOf(input);
    const match = Object.entries(answers).find(([suffix]) => url.endsWith(suffix));
    return Promise.resolve(match ? match[1]() : jsonResponse({ code: 'NOT_FOUND' }, 404));
  });
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setLocale('vi');
});

describe('AccountMenu', () => {
  it('names the "..." trigger after the user', async () => {
    await mountMenu();

    expect(trigger().getAttribute('aria-label')).toBe('Tài khoản của Minh Anh');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(panel()).toBeNull();
  });

  it('shows the heading, settings, theme, language and sign out in that order, with checks', async () => {
    await mountMenu();
    await open();

    const entries = [
      ...panel()!.querySelectorAll<HTMLElement>(
        '[data-testid="account-menu-heading"], [role="menuitem"], [role="menuitemradio"]',
      ),
    ].map((entry) => entry.textContent?.trim());
    expect(entries).toEqual([
      'Tài khoản cá nhân',
      'Cài đặt cá nhân',
      'Hệ thống',
      'Sáng',
      'Tối',
      'Tiếng Việt',
      'English',
      'Đăng xuất',
    ]);

    const checked = items()
      .filter((item) => item.getAttribute('aria-checked') === 'true')
      .map((item) => item.textContent?.trim());
    expect(checked).toEqual(['Hệ thống', 'Tiếng Việt']);

    const groups = [...panel()!.querySelectorAll('[role="group"]')].map((group) =>
      group.getAttribute('aria-label'),
    );
    expect(groups).toEqual(['Giao diện', 'Ngôn ngữ']);
    expect(itemNamed('Cài đặt cá nhân').getAttribute('href')).toBe('/settings/personal');
    expect(itemNamed('English').getAttribute('lang')).toBe('en');
  });

  it('follows the personal settings link', async () => {
    await mountMenu();
    await open();

    itemNamed('Cài đặt cá nhân').click();
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/settings/personal');
    expect(panel()).toBeNull();
  });

  it('applies the dark theme when "Tối" is chosen', async () => {
    const theme = initTheme({ storage: null, matchMedia: null, root: document.documentElement });
    const setTheme = vi.spyOn(theme, 'setTheme');
    await mountMenu();
    await open();

    itemNamed('Tối').click();
    await flushPromises();

    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());

    await open();
    expect(itemNamed('Tối').getAttribute('aria-checked')).toBe('true');
    expect(itemNamed('Hệ thống').getAttribute('aria-checked')).toBe('false');
  });

  it('switches to English at once and saves it on the account', async () => {
    await mountMenu();
    await open();

    itemNamed('English').click();
    expect(getLocale()).toBe('en');
    await flushPromises();

    expect(panel()!.querySelector('[data-testid="account-menu-heading"]')!.textContent).toBe(
      'Personal account',
    );
    expect(trigger().getAttribute('aria-label')).toBe('Account menu for Minh Anh');
    const [update] = calls('/api/auth/update-user');
    expect(update).toBeDefined();
    const [input, init] = update!;
    const body = input instanceof Request ? await input.clone().text() : String(init?.body);
    expect(JSON.parse(body)).toEqual({ locale: 'en' });
    expect(itemNamed('English').getAttribute('aria-checked')).toBe('true');
    expect(useSessionStore().user?.locale).toBe('en');
    expect(panel()!.querySelector('[role="alert"]')).toBeNull();
  });

  it('goes back to Vietnamese and shows an error when saving the language fails', async () => {
    answers['/api/auth/update-user'] = () => jsonResponse({ code: 'INTERNAL_ERROR' }, 500);
    await mountMenu();
    await open();

    itemNamed('English').click();
    await flushPromises();

    expect(getLocale()).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
    expect(panel()).not.toBeNull();
    expect(itemNamed('Tiếng Việt').getAttribute('aria-checked')).toBe('true');
    expect(panel()!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Không lưu được ngôn ngữ. Vui lòng thử lại.',
    );
    expect(useSessionStore().user?.locale).toBe('vi');
  });

  it('signs out, clears the workspace cache, then goes to sign-in', async () => {
    const order: string[] = [];
    const reset = vi.fn(() => order.push('cache'));
    const unregister = registerWorkspaceCache(reset);
    useWorkspaceStore().activeWorkspaceId = 'org_1';
    answers['/api/auth/sign-out'] = () => {
      order.push('sign-out');
      return jsonResponse({ success: true });
    };
    await mountMenu();
    await open();

    itemNamed('Đăng xuất').click();
    await flushPromises();
    unregister();

    expect(order).toEqual(['sign-out', 'cache']);
    expect(useSessionStore().user).toBeNull();
    expect(useWorkspaceStore().activeWorkspaceId).toBeNull();
    expect(router.currentRoute.value.path).toBe('/sign-in');
  });

  it('stays signed in and shows an error when signing out fails', async () => {
    answers['/api/auth/sign-out'] = () => jsonResponse({ code: 'INTERNAL_ERROR' }, 500);
    await mountMenu();
    await open();

    itemNamed('Đăng xuất').click();
    await flushPromises();

    expect(useSessionStore().user?.name).toBe('Minh Anh');
    expect(router.currentRoute.value.path).toBe('/jobs');
    expect(panel()!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Không đăng xuất được. Vui lòng thử lại.',
    );
  });

  it('works from the keyboard: open, arrows through every option, Escape back to the trigger', async () => {
    await mountMenu();
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();

    expect(panel()).not.toBeNull();
    const reached: string[] = [];
    for (let i = 0; i < items().length; i++) {
      reached.push(document.activeElement?.textContent?.trim() ?? '');
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      await flushPromises();
    }
    expect(reached).toEqual([
      'Cài đặt cá nhân',
      'Hệ thống',
      'Sáng',
      'Tối',
      'Tiếng Việt',
      'English',
      'Đăng xuất',
    ]);
    // Arrow Down wraps to the first option.
    expect(document.activeElement?.textContent?.trim()).toBe('Cài đặt cá nhân');

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushPromises();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('opens above the sidebar footer row, on its start edge, leaving the divider visible', async () => {
    // At 1440 x 900 the footer row (with its 1 px top divider) runs 16..207 from y 831; the "..."
    // trigger sits at its right end. The panel is 232 x 210.
    const row = document.createElement('div');
    row.setAttribute('data-testid', 'app-sidebar-user');
    document.body.append(row);
    const box = (left: number, top: number, width: number, height: number) =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1440);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(900);
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this === row) return box(16, 831, 191, 53);
      if (this.getAttribute('data-testid') === 'account-menu-trigger') return box(180, 848, 28, 28);
      if (this.getAttribute('role') === 'menu') return box(0, 0, 232, 210);
      return original.call(this);
    });
    try {
      await mountMenu(row);
      await open();

      const left = parseFloat(panel()!.style.left);
      const top = parseFloat(panel()!.style.top);
      expect(left).toBe(16);
      expect(top + 210).toBeLessThanOrEqual(831);
      expect(top + 210).toBeGreaterThanOrEqual(831 - 8);
    } finally {
      mounted.splice(0).forEach((wrapper) => wrapper.unmount());
      row.remove();
    }
  });
});
