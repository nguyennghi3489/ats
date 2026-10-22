import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, type Router, RouterView } from 'vue-router';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import { createAppRouter } from '../../router';
import CreateWorkspaceView from './CreateWorkspaceView.vue';

const copy = viMessages.workspaces.create;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const created = (name = 'An Nhiên') =>
  jsonResponse({ id: 'org_1', name, codePrefix: 'AN', role: 'admin' }, 201);
const unavailable = () => jsonResponse({ code: 'INTERNAL_ERROR', message: 'Unavailable' }, 503);
const listOf = (count: number) =>
  jsonResponse({
    activeWorkspaceId: count > 0 ? 'org_0' : null,
    workspaces: Array.from({ length: count }, (_, i) => ({
      id: `org_${i}`,
      name: `Không gian ${i}`,
      codePrefix: 'KG',
      role: 'admin',
    })),
  });

type Answer = () => Response | Promise<Response>;

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let router: Router;
let pinia: Pinia;
/** What `POST /api/workspaces` answers, one entry per call; the last one repeats. */
let createAnswers: Answer[];
/** What `GET /api/workspaces` answers. */
let listAnswer: Answer;

function requestOf(index: number): Request {
  const [input, init] = fetchFn.mock.calls[index]!;
  return input instanceof Request ? input : new Request(input, init);
}

function requests(): Request[] {
  return fetchFn.mock.calls.map((_, index) => requestOf(index));
}

/** Every `POST /api/workspaces` sent so far. */
function createRequests(): Request[] {
  return requests().filter(
    (r) => r.method === 'POST' && new URL(r.url, 'http://localhost').pathname === '/api/workspaces',
  );
}

async function mountView(path = '/workspaces/new') {
  await router.push(path);
  await router.isReady();
  const wrapper = mount(CreateWorkspaceView, {
    global: { plugins: [i18n, router, pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const nameInput = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="create-workspace-name"]');
const submitButton = (w: Wrapper) =>
  w.get<HTMLButtonElement>('[data-testid="create-workspace-submit"]');
const title = (w: Wrapper) => w.get('h1').text();

async function create(w: Wrapper, name = 'An Nhiên') {
  await nameInput(w).setValue(name);
  await w.get('form').trigger('submit');
  await flushPromises();
}

async function arrivedAt(fullPath: string) {
  await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe(fullPath));
}

beforeEach(() => {
  setLocale('vi');
  createAnswers = [created];
  listAnswer = () => listOf(0);
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/api/workspaces' && request.method === 'GET') return listAnswer();
    if (path === '/api/workspaces' && request.method === 'POST') {
      const answer = createAnswers.length > 1 ? createAnswers.shift()! : createAnswers[0]!;
      return answer();
    }
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

describe('CreateWorkspaceView', () => {
  it('is the page at /workspaces/new and needs a session', async () => {
    await router.push('/workspaces/new');
    await router.isReady();
    const App = defineComponent({ render: () => h(RouterView) });
    const wrapper = mount(App, { global: { plugins: [i18n, router, pinia] } });
    await flushPromises();

    expect(router.currentRoute.value.meta.public).toBeUndefined();
    expect(wrapper.get('h1').text()).toBe(copy.title);
  });

  it('shows WS-01: title, name field, button, invite notice and sign-out', async () => {
    const wrapper = await mountView();

    expect(title(wrapper)).toBe('Tạo không gian làm việc');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Đặt tên cho không gian nhà tuyển dụng của bạn.',
    );
    expect(wrapper.get('label').text().replace('*', '')).toBe('Tên nhà tuyển dụng / không gian');
    expect(nameInput(wrapper).element.value).toBe('');
    expect(submitButton(wrapper).text()).toBe('Tạo không gian');
    expect(wrapper.get('[data-testid="create-workspace-invite-notice"]').text()).toBe(
      'Tham gia không gian có sẵn chỉ qua lời mời. Hãy nhờ quản trị viên gửi lời mời.',
    );
    expect(wrapper.get('[data-testid="create-workspace-sign-out"]').text()).toBe('Đăng xuất');
    expect(wrapper.find('[data-testid="create-workspace-back-to-list"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows the field error and sends nothing for an empty name', async () => {
    const wrapper = await mountView();

    await create(wrapper, '   ');

    expect(wrapper.text()).toContain(copy.errors.NAME_REQUIRED);
    expect(nameInput(wrapper).attributes('aria-invalid')).toBe('true');
    expect(createRequests()).toHaveLength(0);
    expect(document.activeElement).toBe(nameInput(wrapper).element);
  });

  it('shows the field error and sends nothing for a name over 80 characters', async () => {
    const wrapper = await mountView();

    await create(wrapper, 'a'.repeat(81));

    expect(wrapper.text()).toContain('Tên không gian tối đa 80 ký tự');
    expect(createRequests()).toHaveLength(0);
  });

  it('shows WS-02 while the request runs: field and button disabled, "Đang tạo..."', async () => {
    let finish!: (response: Response) => void;
    createAnswers = [() => new Promise<Response>((resolve) => (finish = resolve))];
    const wrapper = await mountView();

    await create(wrapper);

    expect(title(wrapper)).toBe('Đang tạo không gian');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Vui lòng chờ trong khi yêu cầu được xử lý.',
    );
    expect(nameInput(wrapper).element.disabled).toBe(true);
    expect(submitButton(wrapper).element.disabled).toBe(true);
    expect(submitButton(wrapper).text()).toBe('Đang tạo...');
    expect(wrapper.get('[data-testid="create-workspace-pending-notice"]').text()).toBe(
      'Yêu cầu tạo không gian đang được xử lý.',
    );
    expect(wrapper.find('[data-testid="create-workspace-invite-notice"]').exists()).toBe(false);

    finish(created());
    await flushPromises();
    await arrivedAt('/jobs');
  });

  it('sends the trimmed name with an Idempotency-Key and lands on / afterwards', async () => {
    const wrapper = await mountView();

    await create(wrapper, '  An Nhiên  ');

    const [request] = createRequests();
    expect(await request!.clone().json()).toEqual({ name: 'An Nhiên' });
    expect(request!.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    await arrivedAt('/jobs');
  });

  it('shows WS-03 on a 503 and "Thử lại" resends with the same Idempotency-Key', async () => {
    createAnswers = [unavailable, created];
    const wrapper = await mountView();

    await create(wrapper);

    expect(title(wrapper)).toBe('Chưa thể tạo không gian');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe(
      'Không thể hoàn tất yêu cầu lúc này.',
    );
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Chưa thể xác nhận kết quả tạo không gian. Thử lại để tiếp tục.',
    );
    expect(submitButton(wrapper).text()).toBe('Thử lại');
    expect(wrapper.get('[data-testid="create-workspace-back"]').text()).toBe('Quay lại');
    expect(nameInput(wrapper).element.value).toBe('An Nhiên');

    await submitButton(wrapper).trigger('click');
    await flushPromises();

    const [first, second] = createRequests();
    expect(second).toBeDefined();
    expect(second!.headers.get('Idempotency-Key')).toBe(first!.headers.get('Idempotency-Key'));
    expect(await second!.clone().json()).toEqual({ name: 'An Nhiên' });
    await arrivedAt('/jobs');
  });

  it('shows WS-03 when the request never reaches the API', async () => {
    createAnswers = [() => Promise.reject(new TypeError('Failed to fetch'))];
    const wrapper = await mountView();

    await create(wrapper);

    expect(title(wrapper)).toBe(copy.failedTitle);
    expect(router.currentRoute.value.fullPath).toBe('/workspaces/new');
  });

  it('uses a new Idempotency-Key once the name changes', async () => {
    createAnswers = [unavailable, created];
    const wrapper = await mountView();

    await create(wrapper, 'An Nhiên');
    await create(wrapper, 'Hải Đăng');

    const [first, second] = createRequests();
    expect(await second!.clone().json()).toEqual({ name: 'Hải Đăng' });
    expect(second!.headers.get('Idempotency-Key')).not.toBe(first!.headers.get('Idempotency-Key'));
  });

  it('"Quay lại" returns to the form with the name kept, and the same name reuses the key', async () => {
    createAnswers = [unavailable, created];
    const wrapper = await mountView();
    await create(wrapper);

    await wrapper.get('[data-testid="create-workspace-back"]').trigger('click');

    expect(title(wrapper)).toBe(copy.title);
    expect(nameInput(wrapper).element.value).toBe('An Nhiên');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await create(wrapper);
    const [first, second] = createRequests();
    expect(second!.headers.get('Idempotency-Key')).toBe(first!.headers.get('Idempotency-Key'));
  });

  it('shows a 400 VALIDATION_FAILED on the field and stays on the form', async () => {
    createAnswers = [() => jsonResponse({ code: 'VALIDATION_FAILED', message: 'Invalid' }, 400)];
    const wrapper = await mountView();

    await create(wrapper);

    expect(title(wrapper)).toBe(copy.title);
    expect(wrapper.text()).toContain(copy.errors.VALIDATION_FAILED);
    expect(nameInput(wrapper).attributes('aria-invalid')).toBe('true');
  });

  it('shows other refusals translated in an error notice', async () => {
    createAnswers = [
      () => jsonResponse({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 403),
    ];
    const wrapper = await mountView();

    await create(wrapper);

    expect(title(wrapper)).toBe(copy.title);
    expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.EMAIL_NOT_VERIFIED);
  });

  it('"Đăng xuất" signs out and goes to /sign-in', async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-testid="create-workspace-sign-out"]').trigger('click');
    await flushPromises();

    expect(requests().some((r) => new URL(r.url).pathname === '/api/auth/sign-out')).toBe(true);
    await arrivedAt('/sign-in');
  });

  it('shows a failed sign-out in an error notice and stays', async () => {
    const wrapper = await mountView();
    fetchFn.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));

    await wrapper.get('[data-testid="create-workspace-sign-out"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(viMessages.errors.NETWORK_ERROR);
    expect(router.currentRoute.value.fullPath).toBe('/workspaces/new');
  });

  it('shows WS-05 when opened from the chooser', async () => {
    listAnswer = () => listOf(0);
    const wrapper = await mountView('/workspaces/new?from=chooser');

    expect(title(wrapper)).toBe('Tạo không gian mới');
    expect(wrapper.get('[data-testid="auth-subtitle"]').text()).toBe('Đặt tên cho không gian mới.');
    const back = wrapper.get('[data-testid="create-workspace-back-to-list"]');
    expect(back.text()).toBe('Hủy · Quay lại danh sách');
    expect(wrapper.find('[data-testid="create-workspace-invite-notice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-workspace-sign-out"]').exists()).toBe(false);

    await back.trigger('click');
    await arrivedAt('/workspaces');
  });

  it('shows WS-05 when the user already has workspaces', async () => {
    listAnswer = () => listOf(2);
    const wrapper = await mountView();

    expect(title(wrapper)).toBe(copy.newTitle);
    expect(wrapper.get('[data-testid="create-workspace-back-to-list"]').text()).toBe(
      copy.backToList,
    );
  });

  it('keeps WS-01 when the workspace list cannot be read', async () => {
    listAnswer = () => jsonResponse({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    const wrapper = await mountView();

    expect(title(wrapper)).toBe(copy.title);
    expect(wrapper.find('[data-testid="create-workspace-invite-notice"]').exists()).toBe(true);
  });

  it('shows the English copy', async () => {
    setLocale('en');
    const wrapper = await mountView();

    expect(title(wrapper)).toBe(en.workspaces.create.title);
    expect(submitButton(wrapper).text()).toBe(en.workspaces.create.submit);
    expect(wrapper.get('[data-testid="create-workspace-sign-out"]').text()).toBe(
      en.workspaces.create.signOut,
    );
  });
});
