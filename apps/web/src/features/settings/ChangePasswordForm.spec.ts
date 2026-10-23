import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../../i18n';
import en from '../../i18n/locales/en.json';
import viMessages from '../../i18n/locales/vi.json';
import ChangePasswordForm from './ChangePasswordForm.vue';

const copy = viMessages.settings.password;
const signUpErrors = viMessages.auth.signUp.errors;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const changed = () => jsonResponse({ token: 'new-session', user: { id: 'usr_1' } });

let fetchFn: ReturnType<typeof vi.fn<typeof fetch>>;

/** Bodies of every `POST /api/auth/change-password` sent so far. */
async function changeBodies(): Promise<unknown[]> {
  const bodies: unknown[] = [];
  for (const [input, init] of fetchFn.mock.calls) {
    const request = input instanceof Request ? input : new Request(input, init);
    if (new URL(request.url, 'http://localhost').pathname === '/api/auth/change-password') {
      bodies.push(JSON.parse(await request.clone().text()));
    }
  }
  return bodies;
}

function mountForm() {
  return mount(ChangePasswordForm, { global: { plugins: [i18n] }, attachTo: document.body });
}

type Wrapper = ReturnType<typeof mountForm>;
type Field = 'current' | 'new' | 'confirm';

const input = (w: Wrapper, field: Field) =>
  w.get<HTMLInputElement>(`[data-testid="change-password-${field}"]`);
const toggle = (w: Wrapper, field: Field) =>
  w.get<HTMLButtonElement>(`[data-testid="change-password-${field}-toggle"]`);
const submitButton = (w: Wrapper) =>
  w.get<HTMLButtonElement>('[data-testid="change-password-submit"]');

/** The error text tied to a field through `aria-describedby`, or null when it has none. */
function errorOf(w: Wrapper, field: Field): string | null {
  const el = input(w, field).element;
  if (el.getAttribute('aria-invalid') !== 'true') return null;
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
}

async function fill(w: Wrapper, current: string, next: string, confirm: string) {
  await input(w, 'current').setValue(current);
  await input(w, 'new').setValue(next);
  await input(w, 'confirm').setValue(confirm);
}

async function submit(w: Wrapper) {
  await w.get('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  setLocale('vi');
  fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => changed());
  vi.stubGlobal('fetch', fetchFn);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  setLocale('vi');
});

describe('ChangePasswordForm', () => {
  it('is a "Đổi mật khẩu" section with three labelled password fields and a button', () => {
    const wrapper = mountForm();

    const section = wrapper.get('section');
    const heading = wrapper.get('h2');
    expect(heading.text()).toBe('Đổi mật khẩu');
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    const labels = wrapper.findAll('label').map((l) => l.text().replace('*', '').trim());
    expect(labels).toEqual(['Mật khẩu hiện tại', 'Mật khẩu mới', 'Nhập lại mật khẩu mới']);
    for (const field of ['current', 'new', 'confirm'] as const) {
      const el = input(wrapper, field).element;
      expect(el.type).toBe('password');
      expect(document.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
    }
    expect(input(wrapper, 'current').attributes('autocomplete')).toBe('current-password');
    expect(input(wrapper, 'new').attributes('autocomplete')).toBe('new-password');
    expect(input(wrapper, 'confirm').attributes('autocomplete')).toBe('new-password');
    expect(submitButton(wrapper).text()).toBe('Đổi mật khẩu');
    expect(submitButton(wrapper).attributes('type')).toBe('submit');
  });

  it('shows and hides each password with its own labelled toggle', async () => {
    const wrapper = mountForm();

    expect(toggle(wrapper, 'current').text()).toBe(copy.show);
    expect(toggle(wrapper, 'current').attributes('aria-label')).toBe(copy.showCurrent);
    expect(toggle(wrapper, 'current').attributes('aria-controls')).toBe(
      input(wrapper, 'current').attributes('id'),
    );
    await toggle(wrapper, 'current').trigger('click');

    expect(input(wrapper, 'current').attributes('type')).toBe('text');
    expect(toggle(wrapper, 'current').text()).toBe(copy.hide);
    expect(toggle(wrapper, 'current').attributes('aria-label')).toBe(copy.hideCurrent);
    expect(input(wrapper, 'new').attributes('type')).toBe('password');

    await toggle(wrapper, 'new').trigger('click');
    await toggle(wrapper, 'confirm').trigger('click');
    expect(input(wrapper, 'new').attributes('type')).toBe('text');
    expect(input(wrapper, 'confirm').attributes('type')).toBe('text');
    expect(toggle(wrapper, 'confirm').attributes('aria-label')).toBe(copy.hideConfirm);
  });

  it('shows "Mật khẩu nhập lại không khớp" on the third field and does not call the API', async () => {
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-2');
    await submit(wrapper);

    expect(errorOf(wrapper, 'confirm')).toBe('Mật khẩu nhập lại không khớp');
    expect(errorOf(wrapper, 'new')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input(wrapper, 'confirm').element);
  });

  it.each([
    ['short', 'short1', 'PASSWORD_TOO_SHORT'],
    ['long', 'a'.repeat(129), 'PASSWORD_TOO_LONG'],
  ] as const)(
    'refuses a %s new password with the sign-up message and does not call the API',
    async (_label, password, code) => {
      const wrapper = mountForm();

      await fill(wrapper, 'old-Password-1', password, password);
      await submit(wrapper);

      expect(errorOf(wrapper, 'new')).toBe(signUpErrors[code]);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input(wrapper, 'new').element);
    },
  );

  it('asks for the current password before calling the API', async () => {
    const wrapper = mountForm();

    await fill(wrapper, '', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(errorOf(wrapper, 'current')).toBe(copy.errors.CURRENT_PASSWORD_REQUIRED);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input(wrapper, 'current').element);
  });

  it('re-checks the fields as the user types once a submit was refused', async () => {
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-2');
    await submit(wrapper);
    expect(errorOf(wrapper, 'confirm')).not.toBeNull();

    await input(wrapper, 'confirm').setValue('new-Password-1');

    expect(errorOf(wrapper, 'confirm')).toBeNull();
  });

  it('changes the password, signing out other sessions, then clears the fields and says so', async () => {
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(await changeBodies()).toEqual([
      {
        currentPassword: 'old-Password-1',
        newPassword: 'new-Password-1',
        revokeOtherSessions: true,
      },
    ]);
    for (const field of ['current', 'new', 'confirm'] as const) {
      expect(input(wrapper, field).element.value).toBe('');
      expect(errorOf(wrapper, field)).toBeNull();
    }
    const notice = wrapper.get('[data-testid="change-password-done"]');
    expect(notice.text()).toBe('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
    expect(notice.attributes('role')).toBe('status');
  });

  it('shows a wrong current password on "Mật khẩu hiện tại" and keeps what was typed', async () => {
    fetchFn.mockImplementation(async () =>
      jsonResponse({ code: 'INVALID_PASSWORD', message: 'Invalid password' }, 400),
    );
    const wrapper = mountForm();

    await fill(wrapper, 'wrong-Password', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(errorOf(wrapper, 'current')).toBe('Mật khẩu hiện tại chưa đúng');
    expect(document.activeElement).toBe(input(wrapper, 'current').element);
    expect(input(wrapper, 'new').element.value).toBe('new-Password-1');
    expect(wrapper.find('[data-testid="change-password-done"]').exists()).toBe(false);

    await input(wrapper, 'current').setValue('old-Password-1');
    expect(errorOf(wrapper, 'current')).toBeNull();
  });

  it('shows a new password the API refuses on "Mật khẩu mới"', async () => {
    fetchFn.mockImplementation(async () =>
      jsonResponse({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' }, 400),
    );
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(errorOf(wrapper, 'new')).toBe(signUpErrors.PASSWORD_TOO_SHORT);
  });

  it('shows any other failure in an error notice', async () => {
    fetchFn.mockImplementation(async () =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'Boom' }, 500),
    );
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      viMessages.errors.INTERNAL_ERROR,
    );
    expect(submitButton(wrapper).element.disabled).toBe(false);
  });

  it('disables the button and labels it busy while saving, so a second submit sends nothing', async () => {
    let answer!: (response: Response) => void;
    fetchFn.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const wrapper = mountForm();

    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'new-Password-1');
    await submit(wrapper);

    expect(submitButton(wrapper).element.disabled).toBe(true);
    expect(submitButton(wrapper).attributes('aria-busy')).toBe('true');
    expect(submitButton(wrapper).text()).toBe(copy.submitting);
    await submit(wrapper);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    answer(changed());
    await flushPromises();

    expect(submitButton(wrapper).element.disabled).toBe(false);
    expect(submitButton(wrapper).text()).toBe(copy.submit);
  });

  it('follows the interface language', async () => {
    setLocale('en');
    const wrapper = mountForm();

    expect(wrapper.get('h2').text()).toBe(en.settings.password.heading);
    await fill(wrapper, 'old-Password-1', 'new-Password-1', 'other-Password');
    await submit(wrapper);
    expect(errorOf(wrapper, 'confirm')).toBe(en.settings.password.errors.PASSWORD_MISMATCH);
  });
});
