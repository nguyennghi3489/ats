import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, type Router } from 'vue-router';
import { getLocale, i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { initTheme, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '../../lib/theme';
import { createAppRouter } from '../../router';
import { useSessionStore } from '../auth/session.store';
import PersonalSettingsView from './PersonalSettingsView.vue';

const copy = viMessages.settings.personal;
const enCopy = en.settings.personal;

const user = {
  id: 'usr_1',
  name: 'Lê Minh Anh',
  email: 'minh.anh@example.test',
  locale: 'vi' as const,
  emailVerified: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Answer = (body: Record<string, unknown>) => Response | Promise<Response>;

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;
/** The user `GET /api/me` answers with; `update-user` writes into it when it succeeds. */
let serverUser: typeof user & { locale: 'vi' | 'en' };
/** What `POST /api/auth/update-user` answers. */
let updateAnswer: Answer;

function requestOf(index: number): Request {
  const [input, init] = fetchFn.mock.calls[index]!;
  return input instanceof Request ? input : new Request(input, init);
}

function pathOf(request: Request): string {
  return new URL(request.url, 'http://localhost').pathname;
}

/** Bodies of every `POST /api/auth/update-user` sent so far. */
async function updateBodies(): Promise<unknown[]> {
  const bodies: unknown[] = [];
  for (let i = 0; i < fetchFn.mock.calls.length; i++) {
    const request = requestOf(i);
    if (pathOf(request) === '/api/auth/update-user') {
      bodies.push(JSON.parse(await request.clone().text()));
    }
  }
  return bodies;
}

async function mountView() {
  const session = useSessionStore();
  session.user = { ...user };
  session.status = 'signed-in';
  await router.push('/settings/personal');
  await router.isReady();
  const wrapper = mount(PersonalSettingsView, {
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const nameInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="personal-settings-name"]');
const emailInput = (w: Wrapper) =>
  w.get<HTMLInputElement>('[data-testid="personal-settings-email"]');
const radio = (w: Wrapper, testid: string) => w.get<HTMLInputElement>(`[data-testid="${testid}"]`);

async function saveName(w: Wrapper, name: string) {
  await nameInput(w).setValue(name);
  await w.get('[data-testid="personal-settings-profile"]').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  setLocale('vi');
  localStorage.setItem(THEME_STORAGE_KEY, 'light');
  initTheme({ storage: localStorage, matchMedia: null, root: document.documentElement });
  serverUser = { ...user };
  updateAnswer = (body) => {
    Object.assign(serverUser, body);
    return jsonResponse({ status: true });
  };
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = pathOf(request);
    if (path === '/api/me') return jsonResponse({ user: serverUser });
    if (path === '/api/auth/update-user') {
      return updateAnswer(JSON.parse(await request.clone().text()) as Record<string, unknown>);
    }
    if (path === '/api/workspaces')
      return jsonResponse({ activeWorkspaceId: null, workspaces: [] });
    return jsonResponse({ code: 'NOT_FOUND', message: 'Not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchFn);
  pinia = createPinia();
  setActivePinia(pinia);
  router = createAppRouter(createMemoryHistory(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  localStorage.clear();
  setLocale('vi');
});

describe('PersonalSettingsView', () => {
  it('is the page at /settings/personal', async () => {
    await router.push('/settings/personal');
    // The lazy component is resolved (and replaced by the loaded one) during the navigation.
    const matched = router.currentRoute.value.matched.at(-1);
    expect(matched?.name).toBe('personal-settings');
    expect(matched?.components?.default).toBe(PersonalSettingsView);
  });

  it('has one h1 with the page title and a heading per section', async () => {
    const wrapper = await mountView();

    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toBe('Cài đặt cá nhân');
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual([
      copy.profile.heading,
      copy.language.heading,
      copy.theme.heading,
      viMessages.settings.password.heading,
    ]);
  });

  it('fills the name, shows the email read-only and selects the current language and theme', async () => {
    const wrapper = await mountView();

    expect(nameInput(wrapper).element.value).toBe('Lê Minh Anh');
    expect(emailInput(wrapper).element.value).toBe('minh.anh@example.test');
    expect(emailInput(wrapper).element.readOnly).toBe(true);
    expect(radio(wrapper, 'personal-settings-locale-vi').element.checked).toBe(true);
    expect(radio(wrapper, 'personal-settings-locale-en').element.checked).toBe(false);
    expect(radio(wrapper, 'personal-settings-theme-light').element.checked).toBe(true);
    expect(radio(wrapper, 'personal-settings-theme-dark').element.checked).toBe(false);
    expect(radio(wrapper, 'personal-settings-theme-system').element.checked).toBe(false);
  });

  it('gives every control a visible label', async () => {
    const wrapper = await mountView();

    for (const input of wrapper.findAll('input')) {
      const id = input.attributes('id');
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const wrapping = input.element.closest('label');
      expect((label ?? wrapping)?.textContent?.trim()).toBeTruthy();
    }
    expect(wrapper.findAll('legend').map((l) => l.text())).toEqual([
      copy.language.legend,
      copy.theme.legend,
    ]);
  });

  it.each(['', '   '])(
    'refuses the name %j as required without calling updateUser',
    async (name) => {
      const wrapper = await mountView();

      await saveName(wrapper, name);

      expect(wrapper.text()).toContain(copy.profile.errors.NAME_REQUIRED);
      expect(nameInput(wrapper).attributes('aria-invalid')).toBe('true');
      expect(await updateBodies()).toEqual([]);
    },
  );

  it('refuses a name over 80 characters without calling updateUser', async () => {
    const wrapper = await mountView();

    await saveName(wrapper, 'a'.repeat(81));

    expect(wrapper.text()).toContain(copy.profile.errors.NAME_TOO_LONG.replace('{max}', '80'));
    expect(await updateBodies()).toEqual([]);
  });

  it('saves the trimmed name, refreshes the session and shows a success notice', async () => {
    const wrapper = await mountView();

    await saveName(wrapper, '  Trần Thu Hà  ');

    expect(await updateBodies()).toEqual([{ name: 'Trần Thu Hà' }]);
    expect(useSessionStore().user?.name).toBe('Trần Thu Hà');
    expect(wrapper.get('[data-testid="personal-settings-profile-saved"]').text()).toBe(
      copy.profile.saved,
    );
    expect(nameInput(wrapper).element.value).toBe('Trần Thu Hà');
  });

  it('shows an API refusal of the name on the field', async () => {
    updateAnswer = () => jsonResponse({ code: 'INTERNAL_ERROR', message: 'Boom' }, 500);
    const wrapper = await mountView();

    await saveName(wrapper, 'Trần Thu Hà');

    expect(nameInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(viMessages.errors.INTERNAL_ERROR);
    expect(wrapper.find('[data-testid="personal-settings-profile-saved"]').exists()).toBe(false);
    expect(useSessionStore().user?.name).toBe('Lê Minh Anh');
  });

  it('switches the language at once and saves it on the account', async () => {
    const wrapper = await mountView();

    await radio(wrapper, 'personal-settings-locale-en').setValue(true);

    expect(getLocale()).toBe('en');
    expect(wrapper.get('h1').text()).toBe(enCopy.title);
    await flushPromises();
    expect(await updateBodies()).toEqual([{ locale: 'en' }]);
    expect(useSessionStore().user?.locale).toBe('en');
  });

  it('brings the previous language back with an error when saving it fails', async () => {
    updateAnswer = () => jsonResponse({ code: 'INTERNAL_ERROR', message: 'Boom' }, 500);
    const wrapper = await mountView();

    await radio(wrapper, 'personal-settings-locale-en').setValue(true);
    await flushPromises();

    expect(getLocale()).toBe('vi');
    expect(wrapper.get('h1').text()).toBe(copy.title);
    expect(radio(wrapper, 'personal-settings-locale-vi').element.checked).toBe(true);
    expect(wrapper.get('[data-testid="personal-settings-locale-error"]').text()).toBe(
      copy.language.error,
    );
  });

  it('applies the theme at once and says it is saved on this device', async () => {
    const wrapper = await mountView();

    await radio(wrapper, 'personal-settings-theme-dark').setValue(true);
    await flushPromises();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(wrapper.text()).toContain(copy.theme.helper);
    expect(await updateBodies()).toEqual([]);
  });

  it('mounts the change-password section below the others through the `password` slot', async () => {
    const session = useSessionStore();
    session.user = { ...user };
    session.status = 'signed-in';
    const wrapper = mount(PersonalSettingsView, {
      global: { plugins: [i18n, router, pinia] },
      slots: { password: '<section data-testid="password-section">pw</section>' },
    });
    await flushPromises();

    const sections = wrapper.findAll('section').map((s) => s.attributes('data-testid'));
    expect(sections.at(-1)).toBe('password-section');
    expect(sections.indexOf('personal-settings-theme-section')).toBe(sections.length - 2);
  });
});
