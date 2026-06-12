/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUB_URL?: string
  readonly VITE_STORYBOOK_URL?: string
  readonly VITE_USE_HASH_ROUTER?: string
  readonly VITE_STORAGE_SCOPE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
