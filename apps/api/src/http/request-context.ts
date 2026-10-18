import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `requestId` available to everything it calls, including async work. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The id of the request being handled, or `undefined` outside a request (startup, jobs). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
