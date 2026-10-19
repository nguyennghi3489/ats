/**
 * Keeps signed-out visitors out of the app and brings them back afterwards (decisions §2).
 *
 * - Every route needs a session unless its meta says `public: true` (the auth pages).
 * - A signed-out visitor on a protected route goes to `/sign-in?redirect=<full path>`.
 * - A signed-in user on a `guestOnly` page (`/sign-in`, `/sign-up`) goes to `/`.
 * - When any API call answers 401 `UNAUTHENTICATED` while signed in, the session has expired: the
 *   store is cleared and the user goes to `/sign-in?redirect=<current path>&expired=1`. The store is
 *   cleared synchronously by the first 401, so parallel 401s after it navigate no further.
 *
 * The server enforces access on every request (§3); this guard only decides which page to show.
 */
import type { Pinia } from 'pinia';
import type { Router } from 'vue-router';
import { onUnauthenticated } from '../../lib/api';
import { DEFAULT_REDIRECT, signInPath } from './redirect';
import { useSessionStore } from './session.store';

/** Installs the guard and the session-expiry hook; returns a function that removes both. */
export function installAuthGuard(router: Router, pinia?: Pinia): () => void {
  // One `GET /api/me` per app start. A failed check (network, 5xx) leaves the status `unknown`, which
  // is not signed in; it is asked again only when a protected page is opened.
  let checked = false;
  let loaded = false;

  async function ensureSession(protectedRoute: boolean) {
    const session = useSessionStore(pinia);
    if (!loaded && (!checked || protectedRoute)) {
      checked = true;
      try {
        await session.load();
        loaded = true;
      } catch {
        // Treated as signed out for this navigation.
      }
    }
    return session;
  }

  const removeGuard = router.beforeEach(async (to) => {
    const session = await ensureSession(!to.meta.public);
    if (to.meta.public) {
      return to.meta.guestOnly && session.isSignedIn ? DEFAULT_REDIRECT : true;
    }
    return session.isSignedIn ? true : signInPath(to.fullPath);
  });

  const removeHook = onUnauthenticated(() => {
    const session = useSessionStore(pinia);
    if (!session.isSignedIn) return;
    session.clear();
    const current = router.currentRoute.value;
    if (current.meta.public) return;
    void router.push(signInPath(current.fullPath, { expired: true }));
  });

  return () => {
    removeGuard();
    removeHook();
  };
}
