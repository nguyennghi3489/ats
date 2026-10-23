import type { MeUser, WorkspaceRole } from '@ats/shared';
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

const JOB_ID = '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e';

const job = {
  id: JOB_ID,
  code: 'AN-001',
  title: 'Product Designer',
  status: 'draft',
  accessScope: 'normal',
  owner: { id: 'user-1', name: 'Minh Anh' },
  canEdit: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let role: WorkspaceRole;
/** The language saved on the account, which the app switches to once signed in. */
let locale: MeUser['locale'];
/** What `GET /api/jobs/:id` answers; a function so a test can hold the answer back. */
let jobAnswer: () => Response | Promise<Response>;
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
let uninstall: (() => void) | undefined;

function jobRequests(): string[] {
  return fetchFn.mock.calls
    .map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
    .map((request) => new URL(request.url, 'http://localhost').pathname)
    .filter((path) => path.startsWith('/api/jobs/'));
}

beforeEach(() => {
  setLocale('vi');
  role = 'admin';
  locale = 'vi';
  jobAnswer = () => jsonResponse(job);
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/api/workspaces') {
      return jsonResponse({
        activeWorkspaceId: 'org_1',
        workspaces: [{ id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role }],
      });
    }
    if (path.startsWith('/api/jobs/')) return jobAnswer();
    return jsonResponse({ user: { ...user, locale } });
  });
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
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
  await flushPromises();
  return { wrapper, router };
}

type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper'];

const tabs = (w: Wrapper) => w.findAll('[data-testid="job-tabs"] [role="tab"]');
const tabLabels = (w: Wrapper) => tabs(w).map((tab) => tab.text());
const tabNamed = (w: Wrapper, label: string) => tabs(w).find((tab) => tab.text() === label)!;
const selectedTab = (w: Wrapper) =>
  tabs(w)
    .filter((tab) => tab.attributes('aria-selected') === 'true')
    .map((tab) => tab.text());

describe('JobLayout', () => {
  it('shows the breadcrumb, title, reference code, status badge and the five tabs', async () => {
    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    expect(jobRequests()).toEqual([`/api/jobs/${JOB_ID}`]);
    const header = wrapper.get('[data-testid="job-header"]');
    expect(header.get('h1').text()).toBe('Product Designer');
    expect(header.get('[data-testid="job-code"]').text()).toBe('Mã tham chiếu: AN-001');
    expect(header.get('[data-testid="job-status"]').text()).toBe('Bản nháp');
    expect(tabLabels(wrapper)).toEqual([
      'Ứng tuyển',
      'Kế hoạch',
      'Nội dung',
      'Quy trình',
      'Nhóm & quyền truy cập',
    ]);
    expect(wrapper.text()).not.toContain('Đăng tuyển');
    expect(wrapper.text()).not.toContain('Chưa công khai');
    expect(wrapper.findAll('h1')).toHaveLength(1);
  });

  it('links the breadcrumb to the jobs list and ends with the job title', async () => {
    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    const nav = wrapper.get('[data-testid="job-breadcrumb"]');
    expect(nav.element.tagName).toBe('NAV');
    expect(nav.attributes('aria-label')).toBe('Đường dẫn');
    const link = nav.get('a');
    expect(link.text()).toBe('Vị trí tuyển dụng');
    expect(link.attributes('href')).toBe('/jobs');
    expect(nav.get('[aria-current="page"]').text()).toBe('Product Designer');
  });

  it('opens the applications tab by default, with the page placeholder below', async () => {
    const { wrapper, router } = await mountAt(`/jobs/${JOB_ID}`);

    expect(router.currentRoute.value.path).toBe(`/jobs/${JOB_ID}`);
    expect(selectedTab(wrapper)).toEqual(['Ứng tuyển']);
    expect(wrapper.find('[data-testid="placeholder-page"]').exists()).toBe(true);
  });

  it('makes every tab a link to its own URL', async () => {
    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    expect(tabs(wrapper).map((tab) => tab.attributes('href'))).toEqual(
      ['applications', 'plan', 'content', 'stages', 'team'].map((tab) => `/jobs/${JOB_ID}/${tab}`),
    );
    expect(wrapper.get('[data-testid="job-tabs"]').attributes('aria-label')).toBe(
      'Các mục của vị trí',
    );
  });

  it('moves to /jobs/:id/stages when Quy trình is clicked, without loading the job again', async () => {
    const { wrapper, router } = await mountAt(`/jobs/${JOB_ID}`);

    await tabNamed(wrapper, 'Quy trình').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe(`/jobs/${JOB_ID}/stages`);
    expect(selectedTab(wrapper)).toEqual(['Quy trình']);
    expect(jobRequests()).toHaveLength(1);
  });

  it('selects the tab of the URL it is opened at', async () => {
    const { wrapper } = await mountAt(`/jobs/${JOB_ID}/stages`);

    expect(selectedTab(wrapper)).toEqual(['Quy trình']);
  });

  it('moves between tabs with the arrow keys', async () => {
    const { wrapper, router } = await mountAt(`/jobs/${JOB_ID}`);

    await tabNamed(wrapper, 'Ứng tuyển').trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();

    expect(router.currentRoute.value.path).toBe(`/jobs/${JOB_ID}/plan`);
    expect(document.activeElement?.textContent).toContain('Kế hoạch');
  });

  it('shows a busy skeleton while the job loads', async () => {
    let answer: (response: Response) => void = () => {};
    jobAnswer = () => new Promise<Response>((resolve) => (answer = resolve));

    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    const loading = wrapper.get('[data-testid="job-loading"]');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('aria-label')).toBe('Đang tải vị trí tuyển dụng');
    expect(wrapper.find('[data-testid="job-tabs"]').exists()).toBe(false);

    answer(jsonResponse(job));
    await flushPromises();
    expect(wrapper.find('[data-testid="job-loading"]').exists()).toBe(false);
    expect(wrapper.get('h1').text()).toBe('Product Designer');
  });

  it('shows the same unavailable state for a missing or hidden job, with a link back to /jobs', async () => {
    jobAnswer = () => jsonResponse({ code: 'JOB_NOT_FOUND', message: 'Job not found' }, 404);

    const { wrapper } = await mountAt(`/jobs/${JOB_ID}/stages`);

    const state = wrapper.get('[data-testid="job-unavailable"]');
    expect(state.get('h1').text()).toBe('Vị trí không tồn tại hoặc bạn không có quyền xem');
    const back = state.get('a');
    expect(back.text()).toBe('Quay lại danh sách vị trí');
    expect(back.attributes('href')).toBe('/jobs');
    expect(wrapper.find('[data-testid="job-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="placeholder-page"]').exists()).toBe(false);
  });

  it('shows a translated error and loads again on retry for other failures', async () => {
    jobAnswer = () => jsonResponse({ code: 'INTERNAL_ERROR' }, 500);

    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    const state = wrapper.get('[data-testid="job-error"]');
    expect(state.text()).toContain('Máy chủ gặp sự cố. Vui lòng thử lại sau.');
    jobAnswer = () => jsonResponse(job);
    await state.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('Product Designer');
    expect(jobRequests()).toHaveLength(2);
  });

  it('loads the new job when the id in the URL changes', async () => {
    const otherId = '0b8e2a9c-1111-4222-8333-944455556666';
    const { wrapper, router } = await mountAt(`/jobs/${JOB_ID}`);
    jobAnswer = () => jsonResponse({ ...job, id: otherId, code: 'AN-002', title: 'Kế toán' });

    await router.push(`/jobs/${otherId}`);
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('Kế toán');
    expect(jobRequests()).toEqual([`/api/jobs/${JOB_ID}`, `/api/jobs/${otherId}`]);
  });

  it('shows the Open status with its own label', async () => {
    jobAnswer = () => jsonResponse({ ...job, status: 'open' });

    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    expect(wrapper.get('[data-testid="job-status"]').text()).toBe('Đang mở tuyển');
  });

  describe('for a collaborator', () => {
    beforeEach(() => {
      role = 'collaborator';
      jobAnswer = () => jsonResponse({ ...job, canEdit: false });
    });

    it('hides the team tab and names the list "Vị trí của tôi"', async () => {
      const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

      expect(tabLabels(wrapper)).toEqual(['Ứng tuyển', 'Kế hoạch', 'Nội dung', 'Quy trình']);
      expect(wrapper.get('[data-testid="job-breadcrumb"] a').text()).toBe('Vị trí của tôi');
    });

    it('sends /jobs/:id/team to /jobs/:id', async () => {
      const { router, wrapper } = await mountAt(`/jobs/${JOB_ID}/team`);

      expect(router.currentRoute.value.path).toBe(`/jobs/${JOB_ID}`);
      expect(selectedTab(wrapper)).toEqual(['Ứng tuyển']);
    });
  });

  it('lets a recruiter open the team tab', async () => {
    role = 'recruiter';

    const { router, wrapper } = await mountAt(`/jobs/${JOB_ID}/team`);

    expect(router.currentRoute.value.path).toBe(`/jobs/${JOB_ID}/team`);
    expect(selectedTab(wrapper)).toEqual(['Nhóm & quyền truy cập']);
  });

  it('shows the English copy', async () => {
    locale = 'en';
    setLocale('en');

    const { wrapper } = await mountAt(`/jobs/${JOB_ID}`);

    expect(wrapper.get('[data-testid="job-code"]').text()).toBe('Reference code: AN-001');
    expect(wrapper.get('[data-testid="job-status"]').text()).toBe('Draft');
    expect(wrapper.get('[data-testid="job-breadcrumb"] a').text()).toBe('Jobs');
    expect(tabLabels(wrapper)).toEqual([
      'Applications',
      'Plan',
      'Content',
      'Stages',
      'Team & access',
    ]);
  });
});
