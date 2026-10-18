// Issue #33: the Mailpit helper finds the newest message sent to one address, so sign-up and
// verification tests can read the link they need. Needs the Compose `mailpit` service.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { latestMessageTo } from './support/mailpit';
import { sendMail } from './support/smtp';

/** A fresh address per test, so parallel runs and old messages never match. */
function uniqueAddress(label: string): string {
  return `${label}-${randomUUID()}@e2e.example.test`;
}

test.describe('Mailpit helper', () => {
  test('returns the newest message sent to the address', async () => {
    const to = uniqueAddress('newest');
    await sendMail({ to, subject: 'First message', text: 'first body' });
    await sendMail({ to, subject: 'Second message', text: 'second body' });

    const message = await latestMessageTo(to);

    expect(message.subject).toBe('Second message');
    expect(message.text).toContain('second body');
    expect(message.to).toContain(to);
  });

  test('ignores messages sent to other addresses', async () => {
    const to = uniqueAddress('mine');
    await sendMail({ to, subject: 'For me', text: 'mine' });
    await sendMail({ to: uniqueAddress('other'), subject: 'For someone else', text: 'not mine' });

    const message = await latestMessageTo(to);

    expect(message.subject).toBe('For me');
  });

  test('waits for a message that arrives after the call', async () => {
    const to = uniqueAddress('late');
    const pending = latestMessageTo(to, { timeoutMs: 5_000 });
    setTimeout(() => void sendMail({ to, subject: 'Late message', text: 'late' }), 500);

    expect((await pending).subject).toBe('Late message');
  });

  test('fails with the address in the error when nothing arrives', async () => {
    const to = uniqueAddress('nobody');
    await expect(latestMessageTo(to, { timeoutMs: 600 })).rejects.toThrow(to);
  });
});
