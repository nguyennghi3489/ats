# @ats/web

Recruiter single-page app: Vue 3 + Vite + TypeScript, Vue Router, Pinia. Everything sits behind sign-in,
so there is no SSR and no SEO work (decisions §1).

## Scripts

Run from the repository root with `pnpm --filter web <script>`, or from this folder with `pnpm <script>`.
`lint`, `typecheck`, `test` and `build` also run as part of the root scripts (`pnpm -r`).

| Script      | What it does                                                         |
| ----------- | -------------------------------------------------------------------- |
| `dev`       | Vite dev server with hot reload; proxies `/api` to the local API     |
| `build`     | Type-checks, then writes the static bundle to `apps/web/dist`        |
| `preview`   | Serves the built `dist` bundle locally                               |
| `test`      | Vitest unit and component tests (happy-dom + Vue Test Utils)         |
| `lint`      | ESLint: root config plus `eslint-plugin-vue`                         |
| `typecheck` | `vue-tsc` for `src/` (including `.vue` files), `tsc` for Vite config |

## Environment

Vite reads these from the shell or from an untracked `apps/web/.env.local`. Neither holds a secret.

| Variable           | Default                 | Used by                                                       |
| ------------------ | ----------------------- | ------------------------------------------------------------- |
| `VITE_API_URL`     | `/api`                  | `src/lib/api.ts`, as the prefix for every request (in bundle) |
| `API_PROXY_TARGET` | `http://localhost:3000` | `vite.config.ts`, where the dev server forwards `/api`        |

Anything prefixed `VITE_` is compiled into the public bundle, so never put a secret there.

## API client

`src/lib/api.ts` is a thin `fetch` wrapper. Every request sends `credentials: 'include'` so the session
cookie travels with it. A non-2xx response throws an `ApiError` with:

- `code`: the API's error code (for example `WORKSPACE_ACCESS_REVOKED`). The UI branches on and translates
  this value. It never shows the API's `message` to users (decisions §12).
- `status`: the HTTP status, or `0` when no response arrived.

When there was no usable `{ code }` body, the client uses its own codes: `NETWORK_ERROR` if the request
never got a response, and `UNKNOWN_ERROR` if the API answered with an error status but no `{ code }`
body.

```ts
import { api, ApiError } from '@/lib/api';

try {
  const job = await api.get<Job>('/jobs/AN-001');
} catch (error) {
  if (error instanceof ApiError && error.code === 'WORKSPACE_ACCESS_REVOKED') {
    // clear workspace data, route to the workspace chooser
  }
}
```

Use `createApiClient({ baseUrl, fetch })` for a separate client, such as in tests with a stub `fetch`.

To show an error to the user, call `error.translate()`. It returns `errors.<code>` in the active language,
or `errors.unknown` when there is no text for that code. It never returns the raw code.

## Language and formatting

`src/i18n/` sets up vue-i18n in Composition API mode (decisions §12). All user-facing text lives in
`src/i18n/locales/vi.json` and `en.json`. Both files must have the same keys, and `pnpm test` fails if they
don't. English copy needs human review.

- Components: `const { t } = useI18n();` then `t('common.save')`.
- Start-up language: the choice stored in `localStorage` (`ats.locale`), then the first vi/en entry in
  `navigator.languages`, then `vi`.
- `setLocale(locale)` from `src/i18n` switches vue-i18n, `<html lang>` and the stored choice.
  `onLocaleChange(listener)` lets other code react, for example to save the choice on the user's account.
- `formatDate(value)` from `src/i18n/format` always returns `dd/mm/yyyy`. `formatMoney(amount, 'VND' | 'USD')`
  uses the active locale's grouping: `25.000.000 VND` in vi, `25,000,000 VND` in en.
- `translateError(code)` from `src/i18n/errors` maps an API error code to text. `ApiError.translate()`
  uses it.

## Folder layout

```
src/
  main.ts            app bootstrap (vue-i18n, Pinia, router)
  i18n/              vue-i18n setup, locale files, date/money/error formatters
  App.vue            root component
  router/            route table and router factory
  lib/               framework-level helpers with no feature knowledge (api client, ...)
  views/             app-level pages that belong to no feature (home placeholder, 404)
  features/<area>/   everything for one product area
```

### Feature folders: `src/features/<area>/**`

Each product area gets one folder, named after the area in kebab-case: `jobs`, `candidates`,
`applications`, `members`, `auth`, `notifications`, and so on. Inside it:

```
src/features/jobs/
  routes.ts          the area's RouteRecordRaw[]; the root router spreads it in
  api.ts             calls to the API for this area (built on src/lib/api.ts)
  store.ts           Pinia store(s), if the area needs shared state
  components/        components used only by this area
  views/             route-level pages
  *.test.ts          tests next to the code they cover
```

Rules:

- A feature may import from `src/lib/**` and `@ats/shared`. It does not import from another feature's
  internals. Move shared code to `src/lib/` (or `@ats/shared` for schemas) instead.
- Request and response shapes come from the Zod schemas in `@ats/shared`. Don't redeclare them here.
- Lazy-load route components (`component: () => import('./views/JobListView.vue')`) so each area gets its
  own chunk.
- Component file names are multi-word PascalCase (`JobListView.vue`, `StageColumn.vue`).
