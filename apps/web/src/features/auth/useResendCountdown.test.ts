import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { RESEND_COOLDOWN_SECONDS, useResendCountdown } from './useResendCountdown';

function inScope() {
  const scope = effectScope();
  const countdown = scope.run(() => useResendCountdown())!;
  return { scope, countdown };
}

describe('useResendCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-20T08:00:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 60 s between sends (decisions §2)', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  it('starts idle with nothing to wait for', () => {
    const { countdown } = inScope();

    expect(countdown.remaining.value).toBe(0);
    expect(countdown.running.value).toBe(false);
  });

  it('counts down whole seconds and stops at zero', () => {
    const { countdown } = inScope();

    countdown.start(60);
    expect(countdown.remaining.value).toBe(60);
    expect(countdown.running.value).toBe(true);

    vi.advanceTimersByTime(15_000);
    expect(countdown.remaining.value).toBe(45);

    vi.advanceTimersByTime(44_000);
    expect(countdown.remaining.value).toBe(1);
    expect(countdown.running.value).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(countdown.remaining.value).toBe(0);
    expect(countdown.running.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts from the new value when started again', () => {
    const { countdown } = inScope();

    countdown.start(60);
    vi.advanceTimersByTime(50_000);
    countdown.start(42);

    expect(countdown.remaining.value).toBe(42);
    vi.advanceTimersByTime(41_000);
    expect(countdown.remaining.value).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('follows the clock, so a throttled background tab still ends on time', () => {
    const { countdown } = inScope();

    countdown.start(60);
    // The clock jumps 30 s while no tick has run yet.
    vi.setSystemTime(Date.now() + 30_000);
    vi.advanceTimersByTime(1_000);

    expect(countdown.remaining.value).toBe(29);
  });

  it('rounds a fractional wait up and treats zero or less as already done', () => {
    const { countdown } = inScope();

    countdown.start(2.2);
    expect(countdown.remaining.value).toBe(3);

    countdown.start(0);
    expect(countdown.remaining.value).toBe(0);
    expect(countdown.running.value).toBe(false);

    countdown.start(-5);
    expect(countdown.running.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops ticking when stopped or when its scope is disposed', () => {
    const { scope, countdown } = inScope();

    countdown.start(60);
    countdown.stop();
    expect(countdown.remaining.value).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    countdown.start(60);
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
