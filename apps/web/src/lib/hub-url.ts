/**
 * Hub URL resolution for the web client.
 *
 * The Settings → Network panel (and the xNet Cloud claim flow) persist the hub a
 * user wants to dial under this key. App.tsx must READ it on startup — without
 * this, the panel wrote a value nothing ever consumed, so "connect your cloud
 * hub" silently did nothing (the bug called out in exploration 0192).
 */

export const HUB_URL_STORAGE_KEY = 'xnet:hub-url'

/**
 * The build-time default hub URL. An unset VITE_HUB_URL means "no hub" in dev
 * (empty string → local-first) rather than the production hub (exploration
 * 0188). Single source of truth shared by App.tsx and the boot preconnect.
 */
export function defaultHubUrl(): string {
  return import.meta.env.VITE_HUB_URL ?? (import.meta.env.DEV ? '' : 'wss://hub.xnet.fyi')
}

/** The hub URL the client should dial: a user/Cloud override, else the build default. */
export function configuredHubUrl(): string {
  return persistedHubUrl(defaultHubUrl())
}

/**
 * The persisted hub URL if the user configured one, else `fallback` (the
 * build-time default). A share-session endpoint, when present, still takes
 * precedence over this — see `resolveHubSessionFromLocation` in App.tsx.
 */
export function persistedHubUrl(fallback: string): string {
  try {
    return localStorage.getItem(HUB_URL_STORAGE_KEY) || fallback
  } catch {
    return fallback
  }
}

/** Persist (or clear, when empty) the hub URL the client should dial. */
export function setPersistedHubUrl(url: string): void {
  try {
    if (url) localStorage.setItem(HUB_URL_STORAGE_KEY, url)
    else localStorage.removeItem(HUB_URL_STORAGE_KEY)
  } catch {
    // ignore — non-persistent environments fall back to the build-time default
  }
}
