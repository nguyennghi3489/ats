import type { JobHeader, JobStatus } from '@ats/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../../i18n';
import JobStatusMenu from './JobStatusMenu.vue';

const JOB_ID = '6f1c1f9e-3a52-4d4e-9b8f-2f0a2b1c3d4e';

const baseJob: JobHeader = {
  id: JOB_ID,
  code: 'AN-001',
  title: 'Product Designer',
  status: 'draft',
  accessScope: 'normal',
  owner: null,
  canEdit: true,
  version: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** What `POST /api/jobs/:id/status` answers; by default it moves the job like the API. */
let statusAnswer: (body: { to: JobStatus; version: number }) => Response | Promise<Response>;
let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;
const mounted: VueWrapper[] = [];

beforeEach(() => {
  setLocale('vi');
  statusAnswer = ({ to, version }) =>
    jsonResponse({ ...baseJob, status: to, version: version + 1 });
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = (await request.json()) as { to: JobStatus; version: number };
    return statusAnswer(body);
  });
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
  document.documentElement.style.overflow = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setLocale('vi');
});

function mountMenu(job: Partial<JobHeader> = {}) {
  const wrapper = mount(JobStatusMenu, {
    props: { job: { ...baseJob, ...job } },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

function trigger() {
  const el = document.querySelector<HTMLButtonElement>('[data-testid="job-status-trigger"]');
  if (!el) throw new Error('no trigger');
  return el;
}

const items = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
const itemLabels = () => items().map((item) => item.textContent?.trim());
const item = (label: string) => items().find((el) => el.textContent?.trim() === label)!;
const dialog = () => document.querySelector<HTMLDialogElement>('[data-testid="job-close-dialog"]');
const requests = () =>
  fetchFn.mock.calls.map(([input, init]) =>
    input instanceof Request ? input : new Request(input, init),
  );

async function openMenu() {
  trigger().click();
  await flushPromises();
}

function key(el: Element, name: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

async function choose(label: string) {
  await openMenu();
  item(label).click();
  await flushPromises();
}

describe('JobStatusMenu', () => {
  it('is the "Thao tác tuyển dụng" outline button wired to a menu', async () => {
    mountMenu();

    expect(trigger().textContent?.trim()).toBe('Thao tác tuyển dụng');
    expect(trigger().classList).toContain('ats-button--outline');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await openMenu();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it.each<[JobStatus, string[]]>([
    ['draft', ['Mở tuyển']],
    ['open', ['Tạm dừng', 'Đóng vị trí']],
    ['paused', ['Tiếp tục tuyển', 'Đóng vị trí']],
    ['closed', ['Mở lại']],
  ])('offers the moves of a %s job', async (status, labels) => {
    mountMenu({ status });

    await openMenu();

    expect(itemLabels()).toEqual(labels);
  });

  it('opens a Draft job with the loaded version and emits the new header', async () => {
    const wrapper = mountMenu({ version: 4 });

    await choose('Mở tuyển');

    expect(requests()).toHaveLength(1);
    const [request] = requests();
    expect(request!.method).toBe('POST');
    expect(new URL(request!.url, 'http://localhost').pathname).toBe(`/api/jobs/${JOB_ID}/status`);
    expect(await request!.clone().json()).toEqual({ to: 'open', version: 4 });
    expect(wrapper.emitted('changed')).toEqual([[{ ...baseJob, status: 'open', version: 5 }]]);
  });

  it.each<[JobStatus, string, JobStatus]>([
    ['open', 'Tạm dừng', 'paused'],
    ['paused', 'Tiếp tục tuyển', 'open'],
    ['closed', 'Mở lại', 'open'],
  ])('moves a %s job with "%s" straight away', async (status, label, to) => {
    const wrapper = mountMenu({ status });

    await choose(label);

    expect(await requests()[0]!.clone().json()).toEqual({ to, version: 1 });
    expect(wrapper.emitted('changed')?.[0]?.[0]).toMatchObject({ status: to });
    expect(dialog()?.hasAttribute('open')).toBe(false);
  });

  it('asks before closing, and closes only once confirmed', async () => {
    const wrapper = mountMenu({ status: 'paused' });

    await choose('Đóng vị trí');

    expect(requests()).toHaveLength(0);
    const open = dialog()!;
    expect(open.hasAttribute('open')).toBe(true);
    expect(open.querySelector('h2')?.textContent).toBe('Đóng vị trí này?');
    expect(open.textContent).toContain(
      'Vị trí sẽ không nhận ứng tuyển mới và bị ẩn khỏi danh sách mặc định.',
    );
    // Focus starts on Cancel, so Enter right away never closes the job by accident.
    expect(document.activeElement?.textContent?.trim()).toBe('Hủy');

    open.querySelector<HTMLButtonElement>('[data-testid="job-close-confirm"]')!.click();
    await flushPromises();

    expect(await requests()[0]!.clone().json()).toEqual({ to: 'closed', version: 1 });
    expect(wrapper.emitted('changed')?.[0]?.[0]).toMatchObject({ status: 'closed' });
    expect(dialog()?.hasAttribute('open')).toBe(false);
  });

  it('cancels the close with Escape or Hủy and sends nothing', async () => {
    const wrapper = mountMenu({ status: 'open' });

    await choose('Đóng vị trí');
    key(dialog()!, 'Escape');
    await flushPromises();
    expect(dialog()?.hasAttribute('open')).toBe(false);

    await choose('Đóng vị trí');
    dialog()!.querySelector<HTMLButtonElement>('[data-testid="job-close-cancel"]')!.click();
    await flushPromises();

    expect(dialog()?.hasAttribute('open')).toBe(false);
    expect(requests()).toHaveLength(0);
    expect(wrapper.emitted('changed')).toBeUndefined();
  });

  it('is usable from the keyboard: Enter opens on the first item, arrows move, Enter selects', async () => {
    const wrapper = mountMenu({ status: 'open' });

    trigger().focus();
    key(trigger(), 'Enter');
    await flushPromises();
    expect(document.activeElement?.textContent?.trim()).toBe('Tạm dừng');
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement?.textContent?.trim()).toBe('Đóng vị trí');
    key(document.activeElement!, 'Enter');
    await flushPromises();

    expect(dialog()?.hasAttribute('open')).toBe(true);
    key(dialog()!, 'Escape');
    await flushPromises();
    expect(dialog()?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(wrapper.emitted('changed')).toBeUndefined();
  });

  it('keeps the trigger busy while the change runs, so it is sent once', async () => {
    let answer: (response: Response) => void = () => {};
    statusAnswer = () => new Promise<Response>((resolve) => (answer = resolve));
    mountMenu();

    await choose('Mở tuyển');

    expect(trigger().getAttribute('aria-busy')).toBe('true');
    trigger().click();
    await flushPromises();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    answer(jsonResponse({ ...baseJob, status: 'open', version: 2 }));
    await flushPromises();
    expect(trigger().hasAttribute('aria-busy')).toBe(false);
    expect(requests()).toHaveLength(1);
  });

  it('shows a refusal as a translated alert and changes nothing', async () => {
    statusAnswer = () => jsonResponse({ code: 'JOB_NOT_READY', message: 'x' }, 409);
    const wrapper = mountMenu();

    await choose('Mở tuyển');

    const notice = document.querySelector('[data-testid="job-status-error"]')!;
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toContain(
      'Chưa thể mở tuyển: vị trí cần có tiêu đề và ít nhất một vòng tuyển dụng đang dùng.',
    );
    expect(notice.textContent).not.toContain('JOB_NOT_READY');
    expect(notice.querySelector('[data-testid="job-status-reload"]')).toBeNull();
    expect(wrapper.emitted('changed')).toBeUndefined();
  });

  it('closes the confirmation and shows the error when the close is refused', async () => {
    statusAnswer = () => jsonResponse({ code: 'JOB_STATUS_TRANSITION_INVALID', message: 'x' }, 409);
    mountMenu({ status: 'open' });

    await choose('Đóng vị trí');
    dialog()!.querySelector<HTMLButtonElement>('[data-testid="job-close-confirm"]')!.click();
    await flushPromises();

    expect(dialog()?.hasAttribute('open')).toBe(false);
    expect(document.querySelector('[data-testid="job-status-error"]')?.textContent).toContain(
      'Không thể chuyển vị trí sang trạng thái này.',
    );
  });

  it('offers "Tải lại" for a stale version, which asks the page to reload the job', async () => {
    statusAnswer = () => jsonResponse({ code: 'JOB_VERSION_STALE', message: 'x' }, 409);
    const wrapper = mountMenu({ status: 'open' });

    await choose('Tạm dừng');

    const notice = document.querySelector('[data-testid="job-status-error"]')!;
    expect(notice.textContent).toContain(
      'Vị trí vừa được thay đổi ở nơi khác. Tải lại để xem trạng thái mới nhất.',
    );
    const reload = notice.querySelector<HTMLButtonElement>('[data-testid="job-status-reload"]')!;
    expect(reload.textContent?.trim()).toBe('Tải lại');
    reload.click();
    await flushPromises();

    expect(wrapper.emitted('reload')).toHaveLength(1);
  });

  it('clears the error once a later change succeeds', async () => {
    statusAnswer = () => jsonResponse({ code: 'INTERNAL_ERROR' }, 500);
    mountMenu({ status: 'open' });
    await choose('Tạm dừng');
    expect(document.querySelector('[data-testid="job-status-error"]')).not.toBeNull();

    statusAnswer = ({ to }) => jsonResponse({ ...baseJob, status: to, version: 2 });
    await choose('Tạm dừng');

    expect(document.querySelector('[data-testid="job-status-error"]')).toBeNull();
  });

  it('shows the English copy', async () => {
    setLocale('en');
    mountMenu({ status: 'paused' });

    expect(trigger().textContent?.trim()).toBe('Hiring actions');
    await openMenu();
    expect(itemLabels()).toEqual(['Resume hiring', 'Close job']);
    item('Close job').click();
    await flushPromises();
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Close this job?');
    expect(dialog()?.textContent).toContain(
      'The job will stop taking new applications and be hidden from the default list.',
    );
  });
});
