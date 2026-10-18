/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

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
        // The API serves its routes at the root (`/health`), so `/api` is stripped on the way through.
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
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
