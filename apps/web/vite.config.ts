/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

/** API routes served under `/api` itself (apps/api/src/auth, apps/api/src/workspaces, apps/api/src/jobs). */
const API_PREFIXED_ROUTES = /^\/api\/(auth|me|workspaces|jobs)(?=[/?]|$)/;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:3000';

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        // Most API routes live at the root (`/health`), so `/api` is stripped on the way through.
        // Better Auth (`/api/auth/*`), `GET /api/me`, `/api/workspaces` and `/api/jobs` are served with the
        // prefix, so they keep it.
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) =>
            API_PREFIXED_ROUTES.test(path) ? path : path.replace(/^\/api(?=[/?]|$)/, ''),
        },
      },
    },
    test: {
      environment: 'happy-dom',
      // `*.spec.ts` are component specs (src/components/ui/README.md), `*.test.ts` everything else.
      include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  };
});
