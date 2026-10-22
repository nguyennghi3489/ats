/**
 * Cached data of the active workspace, and what happens when access to it is revoked (decisions §3).
 *
 * Every workspace-scoped store calls `registerWorkspaceCache(reset)` once; `clearWorkspaceCache()`
 * calls each `reset()` and resets the workspace store, so nothing of a workspace outlives access
 * to it.
 *
 * When any API call answers 403 `WORKSPACE_ACCESS_REVOKED` (or `WORKSPACE_REQUIRED`) while signed
 * in, `installWorkspaceRevokedHandler` clears the cache, reloads the workspace list and goes to the
 * chooser with `?revoked=1`, which explains what happened, or to `/welcome` when no workspace is
 * left. Parallel refusals are handled once: the ones that arrive while it runs are ignored.
 *
 * The server enforces access on every request (§3); this only decides which page to show.
 */
import type { Pinia } from 'pinia';
import type { Router } from 'vue-router';
import { onWorkspaceAccessRevoked } from '../../lib/api';
import { useSessionStore } from '../auth/session.store';
import { CHOOSER_PATH, WELCOME_PATH } from './workspace.guard';
import { useWorkspaceStore } from './workspace.store';

/** The chooser after a revocation; it shows the "no longer have access" notice. */
export const REVOKED_CHOOSER_PATH = `${CHOOSER_PATH}?revoked=1`;

const resets = new Set<() => void>();

/**
 * Registers a workspace-scoped store's `reset()`, called by every `clearWorkspaceCache()`. Returns
 * a function that unregisters it.
 */
export function registerWorkspaceCache(reset: () => void): () => void {
  resets.add(reset);
  return () => resets.delete(reset);
}

/** Forgets every workspace's cached data: each registered `reset()`, then the workspace store. */
export function clearWorkspaceCache(pinia?: Pinia): void {
  for (const reset of resets) reset();
  useWorkspaceStore(pinia).reset();
}

/** Installs the revoked-access hook; returns a function that removes it. */
export function installWorkspaceRevokedHandler(router: Router, pinia?: Pinia): () => void {
  let handling = false;

  async function handle(): Promise<void> {
    clearWorkspaceCache(pinia);
    const store = useWorkspaceStore(pinia);
    await store.load();
    // A 401 while loading means the session ended; the session guard's hook has taken over.
    if (!useSessionStore(pinia).isSignedIn) return;
    // A list that cannot be read goes to the chooser too, which offers a retry.
    const none = store.status === 'ready' && store.workspaces.length === 0;
    await router.push(none ? WELCOME_PATH : REVOKED_CHOOSER_PATH);
  }

  return onWorkspaceAccessRevoked(() => {
    if (handling || !useSessionStore(pinia).isSignedIn) return;
    handling = true;
    void handle().finally(() => {
      handling = false;
    });
  });
}
