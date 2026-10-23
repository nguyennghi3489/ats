import {
  RESET_PASSWORD_INVALID_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_EXPIRED_PATH,
  VERIFY_EMAIL_SUCCESS_PATH,
  type WorkspaceRole,
} from '@ats/shared';
import type { Pinia } from 'pinia';
import {
  createRouter,
  createWebHistory,
  type LocationQuery,
  type LocationQueryRaw,
  type NavigationGuardWithThis,
  type RouteLocationNormalized,
  type RouteLocationRaw,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from 'vue-router';
import { installAuthGuard } from '../features/auth/guard';
import { installWorkspaceRevokedHandler } from '../features/workspaces/workspace-cache';
import { installWorkspaceGuard } from '../features/workspaces/workspace.guard';
import { useWorkspaceStore } from '../features/workspaces/workspace.store';

declare module 'vue-router' {
  interface RouteMeta {
    /** Opens without a session. Every route without it requires one (see features/auth/guard.ts). */
    public?: boolean;
    /** Only for signed-out visitors: a signed-in user is sent to `/` instead. */
    guestOnly?: boolean;
    /**
     * Workspace roles that may open the page; anyone else is sent to `/jobs` (see `requireRole`).
     * Unset: every member.
     */
    roles?: readonly WorkspaceRole[];
    /**
     * Needs a workspace: users without one go to `/welcome`, users with several and none active to
     * the chooser (see features/workspaces/workspace.guard.ts). Every signed-in page has it except
     * `/workspaces`, `/workspaces/new` and `/welcome`.
     */
    requiresWorkspace?: boolean;
    /** Only for users without a workspace (`/welcome`): anyone else is sent to `/`. */
    withoutWorkspace?: boolean;
  }
}

/** The non-empty `email` query value, or `undefined`. */
export function emailQuery(query: LocationQuery): string | undefined {
  const raw = query.email;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The non-blank `token` query value of a password reset link, or `undefined`. */
export function tokenQuery(query: LocationQuery): string | undefined {
  const raw = query.token;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

// Auth paths without a page of their own show the 404 view so the guard has somewhere to send people.
const authPlaceholder = () => import('../views/NotFoundView.vue');

/** Pages a signed-out visitor can open. `/verify-email/**` and `/reset-password/**` take a token. */
const authRoutes: RouteRecordRaw[] = [
  {
    path: '/sign-in',
    name: 'sign-in',
    component: () => import('../features/auth/SignInView.vue'),
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/sign-up',
    name: 'sign-up',
    component: () => import('../features/auth/SignUpView.vue'),
    meta: { public: true, guestOnly: true },
  },
  // Where the API redirects a verification link (decisions §2); listed before the catch-all below.
  {
    path: VERIFY_EMAIL_SUCCESS_PATH,
    name: 'verify-email-success',
    component: () => import('../features/auth/EmailVerifiedView.vue'),
    meta: { public: true },
  },
  {
    path: VERIFY_EMAIL_EXPIRED_PATH,
    name: 'verify-email-expired',
    component: () => import('../features/auth/LinkExpiredView.vue'),
    meta: { public: true },
  },
  {
    // The check-email page after sign-up (AUTH-03 / AUTH-04); it needs the address in `?email=`.
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('../features/auth/CheckEmailView.vue'),
    meta: { public: true },
    beforeEnter: (to) => (emailQuery(to.query) ? true : { name: 'sign-up' }),
  },
  {
    // Any other verification path (the result pages above are matched first).
    path: '/verify-email/:rest(.*)+',
    name: 'verify-email-result',
    component: authPlaceholder,
    meta: { public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('../features/auth/ForgotPasswordView.vue'),
    meta: { public: true },
  },
  // Where the API redirects a password reset link (decisions §2): here with `?token=` while it can
  // be used, to the invalid page when it is expired, used or unknown. Without a token there is
  // nothing to reset, so that opens the invalid page too.
  {
    path: RESET_PASSWORD_PATH,
    name: 'reset-password',
    component: () => import('../features/auth/ResetPasswordView.vue'),
    meta: { public: true },
    beforeEnter: (to) => (tokenQuery(to.query) ? true : { path: RESET_PASSWORD_INVALID_PATH }),
  },
  {
    path: RESET_PASSWORD_INVALID_PATH,
    name: 'reset-password-invalid',
    component: () => import('../features/auth/ResetPasswordInvalidView.vue'),
    meta: { public: true },
  },
  {
    // Any other reset path (the pages above are matched first).
    path: '/reset-password/:rest(.*)+',
    name: 'reset-password-other',
    component: authPlaceholder,
    meta: { public: true },
  },
];

// Dev-only pages. `import.meta.env.DEV` is replaced by `false` in production builds, so these routes
// and their chunks are dropped and the URLs fall through to the 404 route.
const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/ui',
        name: 'dev-ui',
        component: () => import('../dev/UiGallery.vue'),
        // Development-only component specimens with no workspace data; kept open for QA.
        meta: { public: true },
      },
    ]
  : [];

/** Where a member lands when a page is not for their role. Every role has the jobs page. */
export const ROLE_FALLBACK_PATH = '/jobs';

/**
 * A route guard that sends a member whose role in the active workspace is not in the page's
 * `meta.roles` to `fallback(to)`; without an active workspace there is no role, so they go there
 * too. Route guards run after the auth and workspace guards, so a signed-out visitor still reaches
 * sign-in with the page in `redirect`. A UI convenience only: the API enforces every permission
 * (decisions §3).
 */
export function requireRoleOr(
  fallback: (to: RouteLocationNormalized) => RouteLocationRaw,
): NavigationGuardWithThis<undefined> {
  return async (to) => {
    const allowed = to.meta.roles;
    if (!allowed) return true;
    const workspaces = useWorkspaceStore();
    if (workspaces.status !== 'ready') await workspaces.load();
    const role = workspaces.workspaces.find(
      (workspace) => workspace.id === workspaces.activeWorkspaceId,
    )?.role;
    return role !== undefined && allowed.includes(role) ? true : fallback(to);
  };
}

/** `requireRoleOr` sending anyone else to `/jobs`, for the top-level pages. */
export const requireRole: NavigationGuardWithThis<undefined> = requireRoleOr(
  () => ROLE_FALLBACK_PATH,
);

// Pages whose feature has not landed yet; each feature issue replaces its route's component.
const placeholder = () => import('../views/PlaceholderView.vue');
/** Props of a placeholder inside the job page, under the job title's h1. */
const tabPlaceholder = { headingLevel: 2 };

/** The signed-in, workspace-scoped pages, inside the app layout (sidebar and main area). */
const appRoutes: RouteRecordRaw = {
  path: '/',
  component: () => import('../layouts/AppLayout.vue'),
  // Children inherit it: a user without a workspace goes to `/welcome`, one with several and none
  // active to the chooser (see features/workspaces/workspace.guard.ts).
  meta: { requiresWorkspace: true },
  children: [
    // Redirects apply before guards, so a signed-out visitor at `/` signs in back to `/jobs`.
    { path: '', name: 'home', redirect: ROLE_FALLBACK_PATH },
    { path: 'applications', name: 'applications', component: placeholder },
    {
      path: 'candidates',
      name: 'candidates',
      component: placeholder,
      meta: { roles: ['admin', 'recruiter'] },
      beforeEnter: requireRole,
    },
    {
      // The job list and, nested under it, the job page, so the sidebar's "Vị trí tuyển dụng" stays
      // selected on every job (design "Example · Record · Product Designer").
      path: 'jobs',
      children: [
        { path: '', name: 'jobs', component: placeholder },
        {
          // The job page (features/jobs/JobLayout.vue): header and tabs, each tab its own child route.
          // The applications tab is the default, so `/jobs/:id` shows it too.
          path: ':id',
          component: () => import('../features/jobs/JobLayout.vue'),
          // Until each tab's step lands, its placeholder takes an h2: the job title is the page's h1.
          children: [
            {
              path: 'applications',
              alias: '',
              name: 'job-applications',
              component: placeholder,
              props: tabPlaceholder,
            },
            { path: 'plan', name: 'job-plan', component: placeholder, props: tabPlaceholder },
            { path: 'content', name: 'job-content', component: placeholder, props: tabPlaceholder },
            { path: 'stages', name: 'job-stages', component: placeholder, props: tabPlaceholder },
            {
              // Admins and recruiters only; anyone else lands on the job's default tab.
              path: 'team',
              name: 'job-team',
              component: placeholder,
              props: tabPlaceholder,
              meta: { roles: ['admin', 'recruiter'] },
              beforeEnter: requireRoleOr(
                (to) => `/jobs/${encodeURIComponent(String(to.params.id))}`,
              ),
            },
          ],
        },
      ],
    },
    {
      path: 'settings/workspace',
      name: 'workspace-settings',
      component: placeholder,
      meta: { roles: ['admin'] },
      beforeEnter: requireRole,
    },
    {
      path: 'settings/personal',
      name: 'personal-settings',
      component: () => import('../features/settings/PersonalSettingsView.vue'),
    },
  ],
};

export function buildRoutes(isDev: boolean = import.meta.env.DEV): RouteRecordRaw[] {
  return [
    appRoutes,
    ...authRoutes,
    {
      // Signed-in only: the workspace chooser (WS-04). `?redirect=` is followed after a switch.
      path: '/workspaces',
      name: 'workspace-choose',
      component: () => import('../features/workspaces/ChooseWorkspaceView.vue'),
    },
    {
      // Signed-in only; `?from=chooser` shows the "new workspace" version (WS-05).
      path: '/workspaces/new',
      name: 'workspace-create',
      component: () => import('../features/workspaces/CreateWorkspaceView.vue'),
    },
    {
      // Signed-in only: "Tiếp tục thiết lập" (WS-06) for an account without a workspace.
      path: '/welcome',
      name: 'welcome',
      component: () => import('../features/workspaces/WelcomeView.vue'),
      meta: { withoutWorkspace: true },
    },
    ...(isDev ? devRoutes : []),
    {
      // Deep links to pages that do not exist yet land here, so it needs a workspace like them.
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { requiresWorkspace: true },
    },
  ];
}

export const routes: RouteRecordRaw[] = buildRoutes();

/**
 * Query strings with every key and value encoded like `encodeURIComponent`, so a path carried in
 * `redirect` reads `?redirect=%2Fjobs%3Fstatus%3Dopen` rather than leaving `/`, `?` and `=` bare.
 * The default `parseQuery` reads it back unchanged.
 */
export function stringifyQuery(query: LocationQueryRaw = {}): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    const name = encodeURIComponent(key);
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value === undefined) continue;
      parts.push(value === null ? name : `${name}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join('&');
}

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  isDev: boolean = import.meta.env.DEV,
) {
  return createRouter({ history, routes: buildRoutes(isDev), stringifyQuery });
}

/**
 * Installs the navigation guards in the order they must run: the session guard, then the workspace
 * guard, plus the revoked-workspace hook (features/workspaces/workspace-cache.ts). Call it before
 * `app.use(router)` so the first navigation is guarded too. Returns a function that removes them.
 */
export function installRouteGuards(router: Router, pinia?: Pinia): () => void {
  const removeAuth = installAuthGuard(router, pinia);
  const removeWorkspace = installWorkspaceGuard(router, pinia);
  const removeRevoked = installWorkspaceRevokedHandler(router, pinia);
  return () => {
    removeRevoked();
    removeWorkspace();
    removeAuth();
  };
}
