/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for API requests. Defaults to `/api`. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
