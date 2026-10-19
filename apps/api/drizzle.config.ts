import { defineConfig } from 'drizzle-kit';

// drizzle-kit settings (decisions §1). Tables live next to their feature in `*.schema.ts` files;
// `pnpm --filter api db:generate` diffs them against `drizzle/meta` and writes a new SQL migration.
// Migrations are applied by `pnpm --filter api db:migrate` (src/database/migrate.ts), not drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/database/schema.ts', './src/**/*.schema.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
