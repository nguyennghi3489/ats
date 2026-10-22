import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import ChooseWorkspaceView from './ChooseWorkspaceView.vue';
import { useWorkspaceStore } from './workspace.store';

const copy = viMessages.workspaces.choose;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const anNhien = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };
const may = { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'recruiter' };
const haiDang = { id: 'org_3', name: 'Hải Đăng Labs', codePrefix: 'HD', role: 'collaborator' };

type Answer = () => Response | Promise<Response>;

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;
/** What `GET /api/workspaces` answers, one entry per call; the last one repeats. */
let listAnswers: Answer[];
/** What `PUT /api/workspaces/active` answers. */
let switchAnswer: Answer;

const listOf =
  (workspaces: unknown[], activeWorkspaceId: string | null = null) =>
  () =>
    jsonResponse({ activeWorkspaceId, workspaces });

function requests(): Request[] {
  return fetchFn.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(input, init),
  );
}

const pathOf = (r: Request) => new URL(r.url, 'http://localhost').pathname;

function switchRequests(): Request[] {
  return requests().filter((r) => r.method === 'PUT' && pathOf(r) === '/api/workspaces/active');
}

function listRequests(): Request[] {
  return requests().filter((r) => r.method === 'GET' && pathOf(r) === '/api/workspaces');
}

async function mountView(path = '/workspaces') {
  await router.push(path);
  await router.isReady();
  const wrapper = mount(ChooseWorkspaceView, {
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const rows = (w: Wrapper) => w.findAll<HTMLButtonElement>('[data-testid="workspace-row"]');

async function arrivedAt(fullPath: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe(fullPath));
}

beforeEach(() => {
  setLocale('vi');
  listAnswers = [listOf([anNhien, may, haiDang], 'org_1')];
  switchAnswer = () => jsonResponse(may);
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = pathOf(request);
    if (path === '/api/workspaces' && request.method === 'GET') {
      const answer = listAnswers.length > 1 ? listAnswers.shift()! : listAnswers[0]!;
      return answer();
    }
    if (path === '/api/workspaces/active' && request.method === 'PUT') return switchAnswer();
    if (path === '/api/auth/sign-out') return jsonResponse({ success: true });
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
});

describe('ChooseWorkspaceView', () => {
  it('is the page at /workspaces and needs a session', async () => {
    await router.push('/workspaces');
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router, pinia] } });
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('workspace-choose');
    expect(router.currentRoute.value.meta.public).toBeUndefined();
    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows WS-04: title, subtitle, one row per workspace, create and sign-out', async () => {
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe('Chọn không gian làm việc');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Chọn một nơi để đổi toàn bộ ngữ cảnh nhà tuyển dụng.',
    );
    expect(rows(wrapper).map((r) => r.text().replace('→', '').trim())).toEqual([
      'An Nhiên',
      'Mây Studio',
      'Hải Đăng Labs',
    ]);
    expect(wrapper.get('[data-testid="choose-workspace-create"]').text()).toBe(
      'Tạo không gian mới',
    );
    expect(wrapper.get('[data-testid="choose-workspace-sign-out"]').text()).toBe('Đăng xuất');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(listRequests()).toHaveLength(1);
  });

  it('rows are reachable with Tab order: buttons that are not disabled', async () => {
    const wrapper = await mountView();

    for (const row of rows(wrapper)) {
      expect(row.element.tagName).toBe('BUTTON');
      expect(row.element.disabled).toBe(false);
      expect(row.element.tabIndex).toBe(0);
    }
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])('%s on a row switches to it and lands on /', async (_label, key) => {
    const wrapper = await mountView();
    const second = rows(wrapper)[1]!;
    second.element.focus();

    await second.trigger('keydown', { key });
    await flushPromises();

    const [request] = switchRequests();
    expect(await request!.clone().json()).toEqual({ workspaceId: 'org_2' });
    expect(useWorkspaceStore(pinia).activeWorkspaceId).toBe('org_2');
    await arrivedAt('/jobs');
  });

  it('disables the list while switching and sends one request', async () => {
    let finish!: (response: Response) => void;
    switchAnswer = () => new Promise<Response>((resolve) => (finish = resolve));
    const wrapper = await mountView();

    await rows(wrapper)[1]!.trigger('click');
    await rows(wrapper)[0]!.trigger('click');

    expect(rows(wrapper).every((r) => r.element.disabled)).toBe(true);
    expect(switchRequests()).toHaveLength(1);

    finish(jsonResponse(may));
    await flushPromises();
    await arrivedAt('/jobs');
  });

  it('goes to a safe redirect after switching', async () => {
    const wrapper = await mountView('/workspaces?redirect=%2Fjobs%3Fstatus%3Dopen');

    await rows(wrapper)[1]!.trigger('click');
    await flushPromises();

    await arrivedAt('/jobs?status=open');
  });

  it('ignores an unsafe redirect and lands on /', async () => {
    const wrapper = await mountView('/workspaces?redirect=%2F%2Fevil.example');

    await rows(wrapper)[1]!.trigger('click');
    await flushPromises();

    await arrivedAt('/jobs');
  });

  it('WORKSPACE_UNAVAILABLE reloads the list and shows the translated notice', async () => {
    listAnswers = [listOf([anNhien, may, haiDang], 'org_1'), listOf([anNhien, haiDang], 'org_1')];
    switchAnswer = () =>
      jsonResponse({ code: 'WORKSPACE_UNAVAILABLE', message: 'Unavailable' }, 404);
    const wrapper = await mountView();

    await rows(wrapper)[1]!.trigger('click');
    await flushPromises();

    expect(listRequests()).toHaveLength(2);
    expect(wrapper.get('[role="alert"]').text()).toBe(copy.unavailable);
    expect(rows(wrapper).map((r) => r.text().replace('→', '').trim())).toEqual([
      'An Nhiên',
      'Hải Đăng Labs',
    ]);
    expect(rows(wrapper).every((r) => !r.element.disabled)).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe('/workspaces');
  });

  it('shows other switch failures translated and keeps the list', async () => {
    switchAnswer = () => Promise.reject(new TypeError('Failed to fetch'));
    const wrapper = await mountView();

    await rows(wrapper)[1]!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.NETWORK_ERROR);
    expect(listRequests()).toHaveLength(1);
    expect(rows(wrapper)).toHaveLength(3);
    expect(router.currentRoute.value.fullPath).toBe('/workspaces');
  });

  it('shows a failed list with a retry that reloads it', async () => {
    listAnswers = [
      () => jsonResponse({ code: 'INTERNAL_ERROR', message: 'Down' }, 503),
      listOf([anNhien]),
    ];
    const wrapper = await mountView();

    expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.INTERNAL_ERROR);
    expect(rows(wrapper)).toHaveLength(0);

    await wrapper.get('[data-testid="choose-workspace-retry"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(rows(wrapper)).toHaveLength(1);
  });

  it('"Tạo không gian mới" opens /workspaces/new?from=chooser', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="choose-workspace-create"]').trigger('click');

    await arrivedAt('/workspaces/new?from=chooser');
  });

  it('"Đăng xuất" signs out, forgets the workspaces and goes to /sign-in', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="choose-workspace-sign-out"]').trigger('click');
    await flushPromises();

    expect(requests().some((r) => pathOf(r) === '/api/auth/sign-out')).toBe(true);
    expect(useWorkspaceStore(pinia).workspaces).toEqual([]);
    await arrivedAt('/sign-in');
  });

  it('shows a failed sign-out in an error notice and stays', async () => {
    const wrapper = await mountView();
    fetchFn.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));

    await wrapper.get('[data-testid="choose-workspace-sign-out"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.NETWORK_ERROR);
    expect(router.currentRoute.value.fullPath).toBe('/workspaces');
  });

  it('shows the English copy', async () => {
    setLocale('en');
    const wrapper = await mountView();

    expect(wrapper.get('h1').text()).toBe(en.workspaces.choose.title);
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(en.workspaces.choose.subtitle);
    expect(wrapper.get('[data-testid="choose-workspace-create"]').text()).toBe(
      en.workspaces.choose.create,
    );
    expect(wrapper.get('[data-testid="choose-workspace-sign-out"]').text()).toBe(
      en.workspaces.choose.signOut,
    );
  });
});

describe('ChooseWorkspaceView after revoked access', () => {
  it('shows the revoked notice with ?revoked=1 and lists only the remaining workspaces', async () => {
    listAnswers = [listOf([may, haiDang], null)];
    const wrapper = await mountView('/workspaces?revoked=1');

    const notice = wrapper.get('[data-testid="choose-workspace-revoked"]');
    expect(notice.text()).toBe('Bạn không còn quyền truy cập không gian làm việc này.');
    expect(notice.text()).toBe(viMessages.workspaces.revoked.notice);
    expect(notice.attributes('role')).toBe('status');
    expect(rows(wrapper).map((r) => r.text().replace('→', '').trim())).toEqual([
      'Mây Studio',
      'Hải Đăng Labs',
    ]);
    expect(wrapper.find('[data-testid="choose-workspace-error"]').exists()).toBe(false);
  });

  it('shows the English copy in English', async () => {
    setLocale('en');
    const wrapper = await mountView('/workspaces?revoked=1');

    expect(wrapper.get('[data-testid="choose-workspace-revoked"]').text()).toBe(
      en.workspaces.revoked.notice,
    );
  });

  it.each(['/workspaces', '/workspaces?revoked=0', '/workspaces?redirect=%2Fjobs'])(
    'shows no revoked notice at %s',
    async (path) => {
      const wrapper = await mountView(path);

      expect(wrapper.find('[data-testid="choose-workspace-revoked"]').exists()).toBe(false);
    },
  );
});
