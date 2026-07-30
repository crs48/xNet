/**
 * Boot-time hub/session resolution from the page URL. Extracted from
 * use-boot-sequence so it's testable without dragging in the SQLite worker
 * graph (0290 follow-up).
 */
import { defaultHubUrl, persistedHubUrl, readHubParam, setPersistedHubUrl } from '../lib/hub-url'

// Hub URL from env or default.
//
// In development an unset VITE_HUB_URL means "no hub" (empty string) rather than
// the production hub: dialing wss://hub.xnet.fyi by accident makes the socket
// reach `connected` against a server that won't ack this client's document
// subscriptions, which used to stall page loads (exploration 0188) and also
// leaked dev presence to production. A falsy hub URL keeps the app local-first;
// opt into a real hub by setting VITE_HUB_URL (e.g. ws://localhost:4444).
export const DEFAULT_HUB_URL = defaultHubUrl()

// A hub the user connected via Settings or the xNet Cloud claim flow (persisted in
// localStorage) wins over the build-time default — this is the read half of that
// setting, without which "connect your cloud hub" did nothing (exploration 0192).
export const resolveConfiguredHubUrl = (): string => persistedHubUrl(DEFAULT_HUB_URL)

if (typeof console !== 'undefined') {
  console.info(
    '[xNet] hub:',
    resolveConfiguredHubUrl() || '(none — local-first; set a hub in Settings or VITE_HUB_URL)'
  )
}

type SharedHubSession = {
  endpoint: string
  token: string
  exp: number
}

export function resolveHubSessionFromLocation(): { hubUrl: string; authToken: string | null } {
  try {
    const parsed = new URL(window.location.href)
    // Under hash routing the route query lives inside the fragment
    // (e.g. /app/#/doc/x?shareSession=k) — check both locations.
    const [hashPath, hashQuery = ''] = parsed.hash.split('?')
    const hashParams = new URLSearchParams(hashQuery)
    const shareSession = parsed.searchParams.get('shareSession') ?? hashParams.get('shareSession')

    const stripParams = (...names: string[]): void => {
      for (const name of names) {
        parsed.searchParams.delete(name)
        hashParams.delete(name)
      }
      const hash = hashParams.size > 0 ? `${hashPath}?${hashParams.toString()}` : hashPath
      window.history.replaceState({}, '', `${parsed.pathname}${parsed.search}${hash}`)
    }

    // The /share route's params are its claim INPUT — boot must not consume or
    // strip anything there. `hub` is the claim's issuing hub (part of
    // `link`+`hub`+`#s=` — see parseShareRouteInput), not a pin request, and
    // `payload`/`handle` are the other two claim forms. Stripping them here ran
    // before the route mounted, so every web-fallback claim died with
    // "Missing link, handle, or payload" (0290 follow-up). The share route does
    // its own address-bar sanitization after reading them.
    const routePath = parsed.pathname + (hashPath.startsWith('#/') ? hashPath.slice(1) : '')
    if (/\/share$/.test(routePath)) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }
    // Elsewhere, stray share params are junk that may embed a token — scrub them.
    if (
      parsed.searchParams.has('payload') ||
      parsed.searchParams.has('handle') ||
      hashParams.has('payload') ||
      hashParams.has('handle')
    ) {
      stripParams('payload', 'handle')
    }
    // A `hub` param pins a hub for this browser — the xNet Cloud dashboard's "Open
    // web app" link passes the user's *personal* hub here so the app dials it
    // instead of the shared default. Persist it (so it sticks across reloads) and
    // strip it from the URL; an invalid value is ignored, never persisted.
    const hubParam = readHubParam(parsed.search, parsed.hash)
    if (hubParam.present) {
      if (hubParam.hub) setPersistedHubUrl(hubParam.hub)
      stripParams('hub')
    }
    if (!shareSession) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    const stored = sessionStorage.getItem(`xnet:share-session:${shareSession}`)
    stripParams('shareSession')
    if (!stored) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    sessionStorage.removeItem(`xnet:share-session:${shareSession}`)
    const session = JSON.parse(stored) as SharedHubSession
    if (
      !session ||
      typeof session.endpoint !== 'string' ||
      typeof session.token !== 'string' ||
      session.endpoint.length === 0 ||
      session.token.length === 0 ||
      !Number.isFinite(session.exp) ||
      session.exp <= Date.now()
    ) {
      return { hubUrl: resolveConfiguredHubUrl(), authToken: null }
    }

    return { hubUrl: session.endpoint, authToken: session.token }
  } catch {
    return { hubUrl: DEFAULT_HUB_URL, authToken: null }
  }
}
