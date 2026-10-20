import {
  RESET_PASSWORD_INVALID_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_EMAIL_EXPIRED_PATH,
  VERIFY_EMAIL_SUCCESS_PATH,
} from '@ats/shared';
import {
  createRouter,
  createWebHistory,
  type LocationQuery,
  type LocationQueryRaw,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** Opens without a session. Every route without it requires one (see features/auth/guard.ts). */
    public?: boolean;
    /** Only for signed-out visitors: a signed-in user is sent to `/` instead. */
    guestOnly?: boolean;
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

// The other auth screens arrive in their own issues (forgot password #89); until
// then each route shows the 404 view so the guard has somewhere to send people.
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
    component: authPlaceholder,
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

export function buildRoutes(isDev: boolean = import.meta.env.DEV): RouteRecordRaw[] {
  return [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    ...authRoutes,
    ...(isDev ? devRoutes : []),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
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
