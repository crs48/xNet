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
  /** `on` only in the official hosted demo build — gates all error/analytics reporting (0210). */
  readonly VITE_XNET_TELEMETRY?: string
  /** Sentry DSN for the browser adapter; unset = no Sentry (0210). */
  readonly VITE_SENTRY_DSN?: string
  /** Cookieless analytics domain (e.g. xnet.fyi); unset = no analytics (0210). */
  readonly VITE_ANALYTICS_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
