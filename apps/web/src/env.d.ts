/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUB_URL?: string
  readonly VITE_STORYBOOK_URL?: string
  readonly VITE_USE_HASH_ROUTER?: string
  readonly VITE_STORAGE_SCOPE?: string
  /** Opt-in flag for the /analytics telemetry dashboard (exploration 0187). */
  readonly VITE_TELEMETRY_DASHBOARD?: string
  /** App version, injected from package.json at build (exploration 0195). */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
