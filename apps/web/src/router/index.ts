import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';

// Dev-only pages. `import.meta.env.DEV` is replaced by `false` in production builds, so these routes
// and their chunks are dropped and the URLs fall through to the 404 route.
const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/ui',
        name: 'dev-ui',
        component: () => import('../dev/UiGallery.vue'),
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
    ...(isDev ? devRoutes : []),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ];
}

export const routes: RouteRecordRaw[] = buildRoutes();

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  isDev: boolean = import.meta.env.DEV,
) {
  return createRouter({ history, routes: buildRoutes(isDev) });
}
