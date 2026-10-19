// Node types for this spec only: the stylesheet tests read the component source from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import AtsButton from './AtsButton.vue';
import AtsDialog from './AtsDialog.vue';

const source = (file: string) =>
  readFileSync(join(process.cwd(), 'src/components/ui', file), 'utf8');
const style = (file: string) => /<style[^>]*>([\s\S]*)<\/style>/.exec(source(file))?.[1] ?? '';

const TITLE = 'Lưu trữ hồ sơ ứng viên?';
const BODY = 'Hồ sơ sẽ được đưa ra khỏi danh sách làm việc mặc định.';

const mounted: { unmount(): void }[] = [];
let showModal: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
});

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
  document.documentElement.style.overflow = '';
  vi.restoreAllMocks();
});

interface Options {
  dialogProps?: Record<string, unknown>;
  /** Renders a body without focusable content. */
  plainBody?: boolean;
  noFooter?: boolean;
}

async function mountDialog(options: Options = {}) {
  const open = ref(false);
  const Host = defineComponent({
    setup: () => () =>
      h('div', [
        h('button', { 'data-testid': 'opener', onClick: () => (open.value = true) }, 'Mở'),
        h(
          AtsDialog,
          {
            open: open.value,
            'onUpdate:open': (value: boolean) => (open.value = value),
            title: TITLE,
            closeLabel: 'Đóng',
            ...options.dialogProps,
          },
          {
            default: () =>
              options.plainBody
                ? h('p', BODY)
                : [h('p', BODY), h('a', { href: '#x', 'data-testid': 'link' }, 'Xem')],
            ...(options.noFooter
              ? {}
              : {
                  footer: () => [
                    h(
                      AtsButton,
                      {
                        variant: 'outline',
                        'data-testid': 'cancel',
                        onClick: () => (open.value = false),
                      },
                      () => 'Hủy',
                    ),
                    h(AtsButton, { 'data-testid': 'confirm' }, () => 'Lưu trữ'),
                  ],
                }),
          },
        ),
      ]),
  });
  const wrapper = mount(Host, { attachTo: document.body });
  mounted.push(wrapper);
  const opener = () => document.querySelector<HTMLElement>('[data-testid="opener"]')!;
  const dialog = () => document.querySelector<HTMLDialogElement>('dialog')!;
  const closeButton = () => dialog().querySelector<HTMLButtonElement>('.ats-dialog__close');
  const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

  async function openIt() {
    opener().focus();
    opener().click();
    await settle();
  }

  return { open, opener, dialog, closeButton, byTestId, openIt };
}

function key(el: Element, name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(event);
  return event;
}

async function settle() {
  await nextTick();
  await flushPromises();
}

describe('AtsDialog', () => {
  it('stays closed until opened, then opens as a modal dialog', async () => {
    const { dialog, openIt } = await mountDialog();

    expect(dialog().open).toBe(false);
    expect(showModal).not.toHaveBeenCalled();

    await openIt();

    expect(dialog().open).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('has role dialog, is named by its title and described by its body', async () => {
    const { dialog, openIt } = await mountDialog();
    await openIt();

    // The native <dialog> carries the implicit role "dialog".
    expect(dialog().tagName).toBe('DIALOG');
    const title = document.getElementById(dialog().getAttribute('aria-labelledby')!);
    expect(title?.textContent?.trim()).toBe(TITLE);
    expect(title?.tagName).toBe('H2');
    const body = document.getElementById(dialog().getAttribute('aria-describedby')!);
    expect(body?.textContent).toContain(BODY);
  });

  it('renders the close button as an icon button named by closeLabel', async () => {
    const { closeButton, openIt } = await mountDialog();
    await openIt();

    expect(closeButton()!.classList).toContain('ats-icon-button');
    expect(closeButton()!.getAttribute('aria-label')).toBe('Đóng');
  });

  it('renders the footer slot after the body', async () => {
    const { dialog, openIt } = await mountDialog();
    await openIt();

    const footer = dialog().querySelector('.ats-dialog__footer')!;
    expect(footer.querySelectorAll('button')).toHaveLength(2);
    expect(dialog().querySelector('.ats-dialog__body')!.nextElementSibling).toBe(footer);
  });

  it('leaves out the footer when the slot is empty', async () => {
    const { dialog, openIt } = await mountDialog({ noFooter: true });
    await openIt();

    expect(dialog().querySelector('.ats-dialog__footer')).toBeNull();
  });

  describe('focus', () => {
    it('moves to the first focusable element in the body', async () => {
      const { byTestId, openIt } = await mountDialog();
      await openIt();

      expect(document.activeElement).toBe(byTestId('link'));
    });

    it('moves to the first footer action when the body has nothing focusable', async () => {
      const { byTestId, openIt } = await mountDialog({ plainBody: true });
      await openIt();

      expect(document.activeElement).toBe(byTestId('cancel'));
    });

    it('moves to the dialog itself when body and footer have nothing focusable', async () => {
      const { dialog, openIt } = await mountDialog({ plainBody: true, noFooter: true });
      await openIt();

      expect(document.activeElement).toBe(dialog());
    });

    it('wraps Tab from the last element to the first, and Shift+Tab back', async () => {
      const { closeButton, byTestId, openIt } = await mountDialog();
      await openIt();

      byTestId('confirm').focus();
      const forward = key(byTestId('confirm'), 'Tab');
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeButton());

      const back = key(closeButton()!, 'Tab', { shiftKey: true });
      expect(back.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(byTestId('confirm'));
    });

    it('lets Tab move normally between elements inside the dialog', async () => {
      const { byTestId, openIt } = await mountDialog();
      await openIt();

      byTestId('link').focus();
      expect(key(byTestId('link'), 'Tab').defaultPrevented).toBe(false);
    });

    it('keeps Tab inside when the dialog itself has focus', async () => {
      const { dialog, closeButton, byTestId, openIt } = await mountDialog();
      await openIt();

      dialog().focus();
      key(dialog(), 'Tab');
      expect(document.activeElement).toBe(closeButton());
      dialog().focus();
      key(dialog(), 'Tab', { shiftKey: true });
      expect(document.activeElement).toBe(byTestId('confirm'));
    });

    it('returns to the opener when it closes', async () => {
      const { opener, byTestId, openIt } = await mountDialog();
      await openIt();

      byTestId('cancel').click();
      await settle();

      expect(document.activeElement).toBe(opener());
    });
  });

  describe('closing', () => {
    it('closes on Escape', async () => {
      const { open, dialog, opener, openIt } = await mountDialog();
      await openIt();

      const event = key(document.activeElement!, 'Escape');
      await settle();

      expect(event.defaultPrevented).toBe(true);
      expect(open.value).toBe(false);
      expect(dialog().open).toBe(false);
      expect(document.activeElement).toBe(opener());
    });

    it('closes on the close button', async () => {
      const { open, dialog, closeButton, openIt } = await mountDialog();
      await openIt();

      closeButton()!.click();
      await settle();

      expect(open.value).toBe(false);
      expect(dialog().open).toBe(false);
    });

    it('closes when the caller sets open to false', async () => {
      const { open, dialog, openIt } = await mountDialog();
      await openIt();

      open.value = false;
      await settle();

      expect(dialog().open).toBe(false);
    });

    it('does not close when the backdrop is clicked', async () => {
      const { open, dialog, openIt } = await mountDialog();
      await openIt();

      // A click on the ::backdrop targets the <dialog> element itself.
      dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle();

      expect(open.value).toBe(true);
      expect(dialog().open).toBe(true);
    });

    it('stops the browser cancel (Escape) from closing it on its own', async () => {
      const { open, dialog, openIt } = await mountDialog({ dialogProps: { pending: true } });
      await openIt();

      const cancel = new Event('cancel', { cancelable: true });
      dialog().dispatchEvent(cancel);
      await settle();

      expect(cancel.defaultPrevented).toBe(true);
      expect(open.value).toBe(true);
    });

    it('closes on the browser cancel request when dismissible', async () => {
      const { open, dialog, openIt } = await mountDialog();
      await openIt();

      dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
      await settle();

      expect(open.value).toBe(false);
    });

    it('does not close on Escape or the close button while pending', async () => {
      const { open, dialog, closeButton, openIt } = await mountDialog({
        dialogProps: { pending: true },
      });
      await openIt();

      key(document.activeElement!, 'Escape');
      closeButton()!.click();
      await settle();

      expect(closeButton()!.disabled).toBe(true);
      expect(open.value).toBe(true);
      expect(dialog().open).toBe(true);
    });

    it('does not close on Escape and shows no close button when not dismissible', async () => {
      const { open, dialog, closeButton, openIt } = await mountDialog({
        dialogProps: { dismissible: false },
      });
      await openIt();

      key(document.activeElement!, 'Escape');
      await settle();

      expect(closeButton()).toBeNull();
      expect(open.value).toBe(true);
      expect(dialog().open).toBe(true);
    });

    it('reopens when the browser closes it although closing is blocked', async () => {
      const { open, dialog, openIt } = await mountDialog({ dialogProps: { pending: true } });
      await openIt();

      // Some browsers close a modal on a repeated Escape even when cancel was prevented.
      dialog().close();
      await settle();

      expect(open.value).toBe(true);
      expect(dialog().open).toBe(true);
    });

    it('syncs the model when the browser closes it and closing is allowed', async () => {
      const { open, dialog, openIt } = await mountDialog();
      await openIt();

      dialog().close();
      await settle();

      expect(open.value).toBe(false);
    });
  });

  describe('page scroll', () => {
    it('locks the page scroll while open and restores it on close', async () => {
      const { open, openIt } = await mountDialog();
      document.documentElement.style.overflow = 'auto';

      await openIt();
      expect(document.documentElement.style.overflow).toBe('hidden');

      open.value = false;
      await settle();
      expect(document.documentElement.style.overflow).toBe('auto');
    });

    it('releases the lock when unmounted while open', async () => {
      const { openIt } = await mountDialog();
      await openIt();

      mounted.splice(0).forEach((wrapper) => wrapper.unmount());

      expect(document.documentElement.style.overflow).toBe('');
    });
  });

  describe('stylesheet', () => {
    const css = style('AtsDialog.vue');

    it('uses tokens only, never raw hex colours', () => {
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    });

    it('is 520 px wide with a 24 px inset on desktop', () => {
      expect(css).toMatch(/\.ats-dialog\s*\{[^}]*width:\s*520px/);
      expect(css).toMatch(/\.ats-dialog__frame\s*\{[^}]*padding:\s*var\(--space-6\)/);
    });

    it('narrows to min(328px, 100vw - 32px) below the mobile breakpoint', () => {
      expect(css).toMatch(
        /@media \(max-width: 767px\)\s*\{\s*\.ats-dialog\s*\{[^}]*width:\s*min\(328px, 100vw - 32px\)/,
      );
    });

    it('stacks the actions full width with a 20 px inset in the narrow layout', () => {
      const narrow = /@container[^{]*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
      expect(narrow).toMatch(/padding:\s*20px/);
      expect(narrow).toMatch(/flex-direction:\s*column/);
      expect(narrow).toMatch(/width:\s*100%/);
    });

    it('lets the body scroll inside the dialog', () => {
      expect(css).toMatch(/\.ats-dialog__body\s*\{[^}]*overflow-y:\s*auto/);
    });
  });
});
