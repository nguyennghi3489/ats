/**
 * Sends a signed-in user to the right place for their workspaces (decisions §3, §4; design flow
 * "verified sign-in → no membership → WS-01 / WS-06; member → workspace or WS-04").
 *
 * Runs after the session guard, so only signed-in users reach it. On routes marked
 * `requiresWorkspace` it reads the workspace list, then:
 * - no workspaces → `/welcome` (WS-06);
 * - an active workspace → continue;
 * - exactly one and none active → select it and continue;
 * - several and none active → `/workspaces?redirect=<full path>` (WS-04).
 * A list that cannot be read, or a single workspace that can no longer be selected, also goes to the
 * chooser, which explains the problem and offers a retry.
 *
 * On `/welcome` (meta `withoutWorkspace`) a user who has a workspace is sent to `/` instead.
 *
 * The list is read once on entering the workspace pages (the first navigation, or coming from a
 * sign-in, setup or chooser page) and reused while moving between them, so a workspace created or
 * chosen meanwhile is always seen. The server enforces access on every request (§3); this guard only
 * decides which page to show.
 */
import type { Pinia } from 'pinia';
import type { RouteLocationNormalized, Router } from 'vue-router';
import { DEFAULT_REDIRECT, signInPath } from '../auth/redirect';
import { useSessionStore } from '../auth/session.store';
import { useWorkspaceStore } from './workspace.store';

export const WELCOME_PATH = '/welcome';
export const CHOOSER_PATH = '/workspaces';

/** `/workspaces?redirect=<path>`, encoded like the sign-in redirect. */
export function chooserPath(redirect: string): string {
  return `${CHOOSER_PATH}?redirect=${encodeURIComponent(redirect)}`;
}

/** Installs the guard; returns a function that removes it. Install it after the session guard. */
export function installWorkspaceGuard(router: Router, pinia?: Pinia): () => void {
  return router.beforeEach(async (to, from) => {
    if (!to.meta.requiresWorkspace && !to.meta.withoutWorkspace) return true;

    const store = useWorkspaceStore(pinia);
    // `/welcome` reuses a list just read (the guard's own redirect there); workspace pages re-read it
    // when entered from elsewhere.
    const fresh = to.meta.withoutWorkspace || enteredFromWorkspacePage(from);
    if (store.status !== 'ready' || !fresh) await store.load();

    // A 401 while loading means the session ended; the session guard's hook clears it.
    if (!useSessionStore(pinia).isSignedIn) return signInPath(to.fullPath);

    if (to.meta.withoutWorkspace) {
      return store.status === 'ready' && store.workspaces.length > 0 ? DEFAULT_REDIRECT : true;
    }

    if (store.status !== 'ready') return chooserPath(to.fullPath);
    const { workspaces, activeWorkspaceId } = store;
    if (workspaces.length === 0) return WELCOME_PATH;
    if (workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return true;
    if (workspaces.length === 1) {
      try {
        await store.select(workspaces[0]!.id);
        return true;
      } catch {
        return chooserPath(to.fullPath);
      }
    }
    return chooserPath(to.fullPath);
  });
}

/** The previous page was one of the workspace pages, whose list is still current. */
function enteredFromWorkspacePage(from: RouteLocationNormalized): boolean {
  return from.meta.requiresWorkspace === true;
}
