import { defineConfig } from 'vitest/config';

// `pnpm test:integration`: the API against the real test Postgres (TEST_DATABASE_URL, default the
// Compose `ats_test` database). `pnpm test` runs the unit tests in src/ only and needs no database.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // One file at a time: they share the test database and every test starts by truncating it.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
