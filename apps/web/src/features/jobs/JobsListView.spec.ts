import type { JobSummary, MeUser, WorkspaceRole } from '@ats/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../../App.vue';
import { i18n, setLocale } from '../../i18n';
import { createAppRouter, installRouteGuards } from '../../router';

const user: MeUser = {
  id: 'user-1',
  name: 'Minh Anh',
  email: 'minh.anh@example.test',
  locale: 'vi',
  emailVerified: true,
};

function job(n: number, overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    code: `AN-${String(n).padStart(3, '0')}`,
    title: `Vị trí ${n}`,
    status: 'open',
    owner: { id: 'user-1', name: 'Minh Anh' },
    ...overrides,
  };
}

const designer = job(1, { title: 'Thiết kế sản phẩm', status: 'open' });
const frontend = job(2, { title: 'Kỹ sư Frontend', status: 'draft', owner: null });
const archived = job(3, { title: 'Kế toán', status: 'closed' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(items: JobSummary[], total = items.length, pageNumber = 1): Response {
  return jsonResponse({ items, total, page: pageNumber, pageSize: 25 });
}

let role: WorkspaceRole;
/** What `GET /api/jobs` answers for a request URL; may hold the answer back. */
let listAnswer: (url: URL) => Response | Promise<Response>;
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let uninstall: (() => void) | undefined;
/** The app mounted by the current test, unmounted after it so its teleported menus go too. */
let unmount: (() => void) | undefined;

/** The `GET /api/jobs` requests made so far, as path plus query string. */
function listRequests(): string[] {
  return fetchFn.mock.calls
    .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
    .map((request) => new URL(request.url, 'http://localhost'))
    .filter((url) => url.pathname === '/api/jobs')
    .map((url) => `${url.pathname}${url.search}`);
}

beforeEach(() => {
  setLocale('vi');
  role = 'admin';
  listAnswer = () => page([designer, frontend]);
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/workspaces') {
      return jsonResponse({
        activeWorkspaceId: 'org_1',
        workspaces: [{ id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role }],
      });
    }
    if (url.pathname === '/api/jobs') return listAnswer(url);
    if (url.pathname.startsWith('/api/jobs/')) return jsonResponse({ code: 'JOB_NOT_FOUND' }, 404);
    return jsonResponse({ user });
  });
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  uninstall?.();
  uninstall = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setLocale('vi');
});

async function mountAt(path: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(createMemoryHistory(), false);
  uninstall = installRouteGuards(router, pinia);
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, {
    global: { plugins: [router, pinia, i18n] },
    attachTo: document.body,
  });
  unmount = () => wrapper.unmount();
  await flushPromises();
  return { wrapper, router };
}

type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper'];

const rows = (w: Wrapper) => w.findAll('[data-testid="jobs-table"] tbody tr');
const rowTitles = (w: Wrapper) => rows(w).map((row) => row.get('.ats-table-cell__primary').text());
const createButtons = (w: Wrapper) =>
  w.findAll('button').filter((button) => button.text() === 'Tạo vị trí');
const search = (w: Wrapper) => w.get<HTMLInputElement>('[data-testid="jobs-search"]');
const statusSelect = (w: Wrapper) => w.get<HTMLSelectElement>('[data-testid="jobs-status"]');

describe('JobsListView', () => {
  it('lists the jobs with title, code, status badge and owner, under the page header', async () => {
    const { wrapper } = await mountAt('/jobs');

    expect(listRequests()).toEqual(['/api/jobs']);
    expect(wrapper.get('h1').text()).toBe('Vị trí tuyển dụng');
    expect(wrapper.text()).toContain('Quản lý tất cả vị trí tuyển dụng và trạng thái tuyển dụng.');
    expect(createButtons(wrapper)).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="jobs-table"] th').map((th) => th.text())).toEqual([
      'Vị trí',
      'Trạng thái',
      'Phụ trách',
    ]);
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm', 'Kỹ sư Frontend']);
    const [first, second] = rows(wrapper);
    expect(first!.get('.ats-table-cell__secondary').text()).toBe('AN-001');
    expect(first!.get('[data-testid="job-status"]').text()).toBe('Đang mở tuyển');
    expect(first!.get('[data-testid="job-owner"]').text()).toBe('Minh Anh');
    expect(second!.get('[data-testid="job-status"]').text()).toBe('Bản nháp');
    expect(second!.get('[data-testid="job-owner"]').text()).toBe('—');
  });

  it('links each row to its job page and navigates on a row click', async () => {
    const { wrapper, router } = await mountAt('/jobs');

    expect(rows(wrapper)[0]!.get('a').attributes('href')).toBe(`/jobs/${designer.id}`);
    await rows(wrapper)[1]!.findAll('td')[2]!.trigger('click');

    // The job page is a lazy chunk, so the navigation settles after it loads.
    // A cold or busy run can take seconds to load it, so wait longer than the 1 s default.
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`/jobs/${frontend.id}`), {
      timeout: 15_000,
    });
  });

  it('offers the status filter: all except closed by default, closed as its own option', async () => {
    const { wrapper } = await mountAt('/jobs');

    const options = statusSelect(wrapper).findAll('option');
    expect(options.map((option) => option.text())).toEqual([
      'Tất cả',
      'Bản nháp',
      'Đang mở tuyển',
      'Tạm dừng',
      'Đã đóng',
    ]);
    expect(statusSelect(wrapper).element.value).toBe('active');
    expect(search(wrapper).attributes('placeholder')).toBe('Tìm theo chức danh hoặc mã tham chiếu');
  });

  it('draws the status filter as "Trạng thái: <option>", like the design', async () => {
    const { wrapper } = await mountAt('/jobs');
    const face = () => wrapper.get('.jobs-list__toolbar .ats-select__value').text();

    expect(face()).toBe('Trạng thái: Tất cả');
    await statusSelect(wrapper).setValue('closed');
    await flushPromises();
    expect(face()).toBe('Trạng thái: Đã đóng');

    setLocale('en');
    await flushPromises();
    expect(face()).toBe('Status: Closed');
  });

  it('puts the chosen status in the URL and asks the API for it', async () => {
    listAnswer = (url) =>
      url.searchParams.get('status') === 'closed' ? page([archived]) : page([designer, frontend]);
    const { wrapper, router } = await mountAt('/jobs');

    await statusSelect(wrapper).setValue('closed');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'closed' });
    expect(listRequests()).toEqual(['/api/jobs', '/api/jobs?status=closed']);
    expect(rowTitles(wrapper)).toEqual(['Kế toán']);
    expect(rows(wrapper)[0]!.get('[data-testid="job-status"]').text()).toBe('Đã đóng');
  });

  it('searches 300 ms after the last keystroke and keeps the search in the URL', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    listAnswer = (url) =>
      url.searchParams.get('q') === 'thiet ke' ? page([designer]) : page([designer, frontend]);
    const { wrapper, router } = await mountAt('/jobs');

    await search(wrapper).setValue('thiet');
    vi.advanceTimersByTime(200);
    await search(wrapper).setValue('thiet ke');
    vi.advanceTimersByTime(299);
    await flushPromises();
    expect(listRequests()).toEqual(['/api/jobs']);

    vi.advanceTimersByTime(1);
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ q: 'thiet ke' });
    expect(listRequests()).toEqual(['/api/jobs', '/api/jobs?q=thiet+ke']);
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm']);
  });

  it('reads search, status and page from the URL it is opened at', async () => {
    listAnswer = () => page([designer], 30, 2);
    const { wrapper } = await mountAt('/jobs?q=thiet&status=open&page=2');

    expect(listRequests()).toEqual(['/api/jobs?q=thiet&status=open&page=2']);
    expect(search(wrapper).element.value).toBe('thiet');
    expect(statusSelect(wrapper).element.value).toBe('open');
  });

  it('ignores an unknown status or page in the URL', async () => {
    const { wrapper } = await mountAt('/jobs?status=bogus&page=-3');

    expect(listRequests()).toEqual(['/api/jobs']);
    expect(statusSelect(wrapper).element.value).toBe('active');
  });

  it('goes back to page 1 when the filter changes', async () => {
    listAnswer = (url) => page([designer], 30, Number(url.searchParams.get('page') ?? 1));
    const { wrapper, router } = await mountAt('/jobs?page=2');

    await statusSelect(wrapper).setValue('draft');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'draft' });
  });

  it('shows paging when there are more than 25 jobs and moves to the next page', async () => {
    listAnswer = (url) => {
      const n = Number(url.searchParams.get('page') ?? 1);
      const items =
        n === 1
          ? Array.from({ length: 25 }, (_, i) => job(i + 1))
          : Array.from({ length: 5 }, (_, i) => job(i + 26));
      return page(items, 30, n);
    };
    const { wrapper, router } = await mountAt('/jobs');

    const pager = wrapper.get('[data-testid="jobs-pagination"]');
    expect(pager.element.tagName).toBe('NAV');
    expect(pager.text()).toContain('1–25 / 30');
    expect(rows(wrapper)).toHaveLength(25);
    const previous = pager.get('[data-testid="jobs-page-previous"]');
    expect(previous.attributes('disabled')).toBeDefined();

    await pager.get('[data-testid="jobs-page-next"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ page: '2' });
    expect(rows(wrapper)).toHaveLength(5);
    expect(wrapper.get('[data-testid="jobs-pagination"]').text()).toContain('26–30 / 30');
    expect(wrapper.get('[data-testid="jobs-page-next"]').attributes('disabled')).toBeDefined();
  });

  it('has no paging for 25 jobs or fewer', async () => {
    const { wrapper } = await mountAt('/jobs');

    expect(wrapper.find('[data-testid="jobs-pagination"]').exists()).toBe(false);
  });

  it('shows busy skeleton rows while the list loads', async () => {
    let answer: (response: Response) => void = () => {};
    listAnswer = () => new Promise<Response>((resolve) => (answer = resolve));
    const { wrapper } = await mountAt('/jobs');

    const loading = wrapper.get('[data-testid="jobs-loading"]');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('aria-label')).toBe('Đang tải danh sách vị trí');
    expect(wrapper.find('[data-testid="jobs-search"]').exists()).toBe(true);

    answer(page([designer]));
    await flushPromises();
    expect(wrapper.find('[data-testid="jobs-loading"]').exists()).toBe(false);
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm']);
  });

  it('shows the empty workspace with the first-job action when there are no jobs at all', async () => {
    listAnswer = () => page([]);
    const { wrapper } = await mountAt('/jobs');

    // An empty default list is only an empty workspace if no Closed job exists either.
    expect(listRequests()).toEqual(['/api/jobs', '/api/jobs?status=closed']);
    const empty = wrapper.get('[data-testid="jobs-empty"]');
    expect(empty.get('h2').text()).toBe('Chưa có vị trí tuyển dụng');
    expect(empty.text()).toContain('Tạo vị trí đầu tiên để bắt đầu nhận và quản lý ứng tuyển.');
    expect(empty.get('button').text()).toBe('Tạo vị trí đầu tiên');
    // As in Example · Empty workspace: the header action reads "Tạo vị trí đầu tiên" too, and the
    // empty state's surface shows a "+" rather than the generic empty icon.
    expect(wrapper.get('[data-testid="jobs-create"]').text()).toBe('Tạo vị trí đầu tiên');
    expect(createButtons(wrapper)).toHaveLength(0);
    expect(empty.find('.ats-empty-state__icon [data-testid="jobs-empty-plus"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="jobs-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="jobs-table"]').exists()).toBe(false);
  });

  it('keeps the filter when only Closed jobs exist, so they stay reachable', async () => {
    listAnswer = (url) =>
      url.searchParams.get('status') === 'closed' ? page([archived]) : page([]);
    const { wrapper } = await mountAt('/jobs');

    expect(wrapper.find('[data-testid="jobs-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="jobs-search"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="jobs-no-results"] h2').text()).toBe(
      'Không có vị trí phù hợp',
    );
  });

  it('shows no results with a clear-filters action for a search that matches nothing', async () => {
    listAnswer = (url) => (url.searchParams.has('q') ? page([]) : page([designer, frontend]));
    const { wrapper, router } = await mountAt('/jobs?q=zzz&status=paused');

    const empty = wrapper.get('[data-testid="jobs-no-results"]');
    expect(empty.get('h2').text()).toBe('Không có vị trí phù hợp');
    await empty.get('button').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({});
    expect(search(wrapper).element.value).toBe('');
    expect(statusSelect(wrapper).element.value).toBe('active');
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm', 'Kỹ sư Frontend']);
  });

  it('shows an error notice with a retry that loads the list again', async () => {
    let fail = true;
    listAnswer = () => (fail ? jsonResponse({ code: 'INTERNAL_ERROR' }, 500) : page([designer]));
    const { wrapper } = await mountAt('/jobs');

    const error = wrapper.get('[data-testid="jobs-error"]');
    expect(error.get('[role="alert"]').text()).toContain('Không tải được danh sách vị trí.');
    fail = false;
    await error.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="jobs-error"]').exists()).toBe(false);
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm']);
  });

  it('shows a collaborator "Vị trí của tôi" without the create action', async () => {
    role = 'collaborator';
    const { wrapper } = await mountAt('/jobs');

    expect(wrapper.get('h1').text()).toBe('Vị trí của tôi');
    expect(wrapper.text()).toContain('Các vị trí được phân công cho bạn.');
    expect(createButtons(wrapper)).toHaveLength(0);
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm', 'Kỹ sư Frontend']);
  });

  it('tells a collaborator without assignments so, with no action', async () => {
    role = 'collaborator';
    listAnswer = () => page([]);
    const { wrapper } = await mountAt('/jobs');

    const empty = wrapper.get('[data-testid="jobs-empty"]');
    expect(empty.get('h2').text()).toBe('Bạn chưa được phân công vị trí nào');
    expect(empty.find('button').exists()).toBe(false);
    expect(wrapper.findAll('button').filter((b) => b.text().startsWith('Tạo vị trí'))).toHaveLength(
      0,
    );
  });

  it('shows the create action to a recruiter', async () => {
    role = 'recruiter';
    const { wrapper } = await mountAt('/jobs');

    expect(createButtons(wrapper)).toHaveLength(1);
  });

  it('speaks English when the account language is English', async () => {
    setLocale('en');
    fetchFn.mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/workspaces') {
        return jsonResponse({
          activeWorkspaceId: 'org_1',
          workspaces: [{ id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role }],
        });
      }
      if (url.pathname === '/api/jobs') return page([designer]);
      return jsonResponse({ user: { ...user, locale: 'en' } });
    });
    const { wrapper } = await mountAt('/jobs');

    expect(wrapper.get('h1').text()).toBe('Jobs');
    expect(rows(wrapper)[0]!.get('[data-testid="job-status"]').text()).toBe('Open');
    expect(createButtons(wrapper)).toHaveLength(0);
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Create job')).toHaveLength(1);
  });

  it('reloads on a workspace switch, so no job of the previous workspace stays on screen', async () => {
    let active = 'org_1';
    const workspaces = [
      { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' },
      { id: 'org_2', name: 'Mây Studio', codePrefix: 'MS', role: 'collaborator' },
    ];
    const mayJob = job(9, { code: 'MS-009', title: 'Biên tập viên' });
    let releaseMay: () => void = () => {};
    const mayHeld = new Promise<void>((resolve) => {
      releaseMay = resolve;
    });
    fetchFn.mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/workspaces/active' && request.method === 'PUT') {
        const { workspaceId } = (await request.json()) as { workspaceId: string };
        active = workspaceId;
        return jsonResponse(workspaces.find((workspace) => workspace.id === workspaceId));
      }
      if (url.pathname === '/api/workspaces') {
        return jsonResponse({ activeWorkspaceId: active, workspaces });
      }
      if (url.pathname === '/api/jobs') {
        if (active === 'org_1') return page([designer, frontend]);
        await mayHeld;
        return page([mayJob]);
      }
      return jsonResponse({ user });
    });
    const { wrapper, router } = await mountAt('/jobs');
    expect(rowTitles(wrapper)).toEqual(['Thiết kế sản phẩm', 'Kỹ sư Frontend']);

    await wrapper.get('[data-testid="workspace-menu-trigger"]').trigger('click');
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="workspace-menu-item-org_2"]')!.click();
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="workspace-menu-name"]').text()).toBe('Mây Studio'),
    );
    await flushPromises();

    // While Mây Studio's list loads, nothing of An Nhiên is left.
    expect(router.currentRoute.value.fullPath).toBe('/jobs');
    expect(wrapper.get('h1').text()).toBe('Vị trí của tôi');
    expect(wrapper.text()).not.toContain('Thiết kế sản phẩm');
    expect(wrapper.text()).not.toContain('Kỹ sư Frontend');

    releaseMay();
    await flushPromises();
    expect(rowTitles(wrapper)).toEqual(['Biên tập viên']);
  });
});
