import {
  createRouter,
  createWebHistory,
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

// The auth screens arrive in their own issues (sign-in #88, sign-up #85, forgot password #89, reset
// password #99); until then each route shows the 404 view so the guard has somewhere to send people.
const authPlaceholder = () => import('../views/NotFoundView.vue');

/** Pages a signed-out visitor can open. `/verify-email/**` and `/reset-password/**` take a token. */
const authRoutes: RouteRecordRaw[] = [
  {
    path: '/sign-in',
    name: 'sign-in',
    component: authPlaceholder,
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/sign-up',
    name: 'sign-up',
    component: authPlaceholder,
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/verify-email/:rest(.*)*',
    name: 'verify-email',
    component: authPlaceholder,
    meta: { public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: authPlaceholder,
    meta: { public: true },
  },
  {
    path: '/reset-password/:rest(.*)*',
    name: 'reset-password',
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
