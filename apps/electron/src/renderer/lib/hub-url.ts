/**
 * Persisted hub (signaling server) URL for the Electron renderer.
 *
 * Mirrors the web client's `apps/web/src/lib/hub-url.ts`: the Settings → Network
 * panel and the xNet Cloud "Open in desktop app" deep link persist the hub the
 * user wants to dial under one key, and the IPC sync manager reads it on boot. A
 * value here overrides the build-time `VITE_HUB_URL` default so a Cloud connect
 * survives restarts (the desktop equivalent of the web's localStorage override).
 */

export const HUB_URL_STORAGE_KEY = 'xnet:hub-url'

/**
 * The build-time default signaling server. Matches the historical Electron
 * default (`ws://localhost:4444`) so existing dev/test setups are unchanged when
 * nothing is persisted.
 */
export function defaultHubUrl(): string {
  return import.meta.env.VITE_HUB_URL || 'ws://localhost:4444'
}

/**
 * The persisted hub URL if the user (or a confirmed Cloud connect) configured one,
 * else `fallback` (the build-time default).
 */
export function persistedHubUrl(fallback: string = defaultHubUrl()): string {
  try {
    return localStorage.getItem(HUB_URL_STORAGE_KEY) || fallback
  } catch {
    return fallback
  }
}

/** The hub URL the client should dial: a user/Cloud override, else the build default. */
export function configuredHubUrl(): string {
  return persistedHubUrl(defaultHubUrl())
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
