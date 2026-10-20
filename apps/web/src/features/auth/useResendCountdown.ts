/**
 * The wait before an email can be sent again (decisions §2: resend is disabled 60 s after each send).
 * `remaining` is in whole seconds and is worked out from a deadline on the clock, so a background tab
 * whose timers are throttled still enables the button on time.
 */
import { computed, onScopeDispose, readonly, ref } from 'vue';

/** Seconds the resend button stays disabled after each send. */
export const RESEND_COOLDOWN_SECONDS = 60;

const TICK_MS = 1_000;

export function useResendCountdown() {
  const remaining = ref(0);
  let deadline = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function clearTimer() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  function tick() {
    remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / TICK_MS));
    if (remaining.value === 0) clearTimer();
  }

  /** Disables for `seconds` from now, replacing any wait already running. */
  function start(seconds: number) {
    clearTimer();
    deadline = Date.now() + Math.max(0, seconds) * TICK_MS;
    tick();
    if (remaining.value > 0) timer = setInterval(tick, TICK_MS);
  }

  function stop() {
    clearTimer();
    deadline = 0;
    remaining.value = 0;
  }

  onScopeDispose(clearTimer);

  return {
    remaining: readonly(remaining),
    running: computed(() => remaining.value > 0),
    start,
    stop,
  };
}
