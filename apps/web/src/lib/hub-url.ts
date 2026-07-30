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

/**
 * Normalize a hub URL handed to the app from outside (the xNet Cloud dashboard's
 * "Open web app" link passes the user's personal hub as `?hub=`). The control plane
 * stores a hub's reachable endpoint as `https://…`, but the client dials it over a
 * WebSocket, so convert http(s)→ws(s); pass ws(s) through unchanged. Requires a
 * ws/wss result with a host and strips a trailing slash, returning `null` for
 * anything else — so a malformed or hostile param can never be persisted or dialed.
 */
export function normalizeHubUrl(raw: string): string | null {
  const trimmed = raw.trim()
  let ws: string
  if (/^https:\/\//i.test(trimmed)) ws = `wss://${trimmed.slice(8)}`
  else if (/^http:\/\//i.test(trimmed)) ws = `ws://${trimmed.slice(7)}`
  else if (/^wss?:\/\//i.test(trimmed)) ws = trimmed
  else return null
  try {
    if (!new URL(ws).host) return null
  } catch {
    return null
  }
  return ws.replace(/\/$/, '')
}

/**
 * Read a `hub` override from a location's query string and hash-query (hash-router
 * routes carry their query inside the fragment). `present` reports whether the param
 * was there at all — so the caller strips it from the URL even when the value was
 * invalid — while `hub` is the normalized ws(s) URL to persist, or `null` when the
 * param is absent or fails `normalizeHubUrl`. Pure, so it's unit-tested directly.
 */
export function readHubParam(
  search: string,
  hash: string
): { present: boolean; hub: string | null } {
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const raw = new URLSearchParams(search).get('hub') ?? new URLSearchParams(hashQuery).get('hub')
  if (raw == null) return { present: false, hub: null }
  return { present: true, hub: normalizeHubUrl(raw) }
}

/**
 * The first-party diagnostics ingest base for this deployment (0341): the
 * connected hub's HTTP origin, or null when this client has no hub. Crash
 * reports go to the deployment's OWN hub first — they never leave the user's
 * trust domain unless the operator separately enables escalation. The client
 * dials one hub today; when multi-home (0258) lands, this should resolve the
 * hub serving the active workspace rather than the single persisted URL.
 */
export function diagnosticsIngestBase(): string | null {
  const hub = configuredHubUrl()
  if (!hub) return null
  if (/^wss:\/\//i.test(hub)) return `https://${hub.slice(6)}`
  if (/^ws:\/\//i.test(hub)) return `http://${hub.slice(5)}`
  return null
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
