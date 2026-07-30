/**
 * Share-link client (exploration 0169).
 *
 * Parses share URLs in their accepted forms and claims them against the
 * issuing hub. A claim records a grant for this identity on the hub; the
 * doc then syncs through the normal subscription path.
 */

export type ShareLinkInput = {
  linkId: string
  /** Hub base URL (http(s) form). */
  hub: string
  secret: string
}

export type ShareClaimResult = {
  resource: string
  docType: 'page' | 'database' | 'canvas' | 'dashboard' | 'view' | 'space' | 'workspace' | 'channel'
  role: 'read' | 'comment' | 'write'
  endpoint: string
}

export class ShareClaimError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ShareClaimError'
  }
}

const LINK_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export const normalizeHubHttpUrl = (url: string): string =>
  url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')

export const normalizeHubWsUrl = (url: string): string =>
  url
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/$/, '')

const secretFromHash = (hash: string): string => {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get('s') ?? ''
}

/**
 * Parse any accepted share-link form:
 * - `https://<hub>/s/<linkId>#s=<secret>` (the canonical shareable URL)
 * - `xnet://share?link=<linkId>&hub=<hubUrl>#s=<secret>` (deep link)
 */
export function parseShareUrl(raw: string): ShareLinkInput | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const match = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{8,64})$/)
      if (!match) return null
      const secret = secretFromHash(url.hash)
      if (!secret) return null
      return { linkId: match[1], hub: `${url.protocol}//${url.host}`, secret }
    }

    if (url.protocol === 'xnet:') {
      // xnet://share?link=...&hub=... — host parses as 'share'
      if (url.hostname !== 'share') return null
      const linkId = url.searchParams.get('link') ?? ''
      const hub = url.searchParams.get('hub') ?? ''
      const secret = secretFromHash(url.hash)
      if (!LINK_ID_RE.test(linkId) || !hub || !secret) return null
      return { linkId, hub: normalizeHubHttpUrl(hub), secret }
    }

    return null
  } catch {
    return null
  }
}

/** Claim a share link, recording a grant for the authenticated identity. */
export async function claimShareLink(
  input: ShareLinkInput,
  authToken: string
): Promise<ShareClaimResult> {
  const hub = normalizeHubHttpUrl(input.hub)
  let response: Response
  try {
    response = await fetch(`${hub}/shares/links/${encodeURIComponent(input.linkId)}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ secret: input.secret }),
      cache: 'no-store'
    })
  } catch {
    // Network-layer failure (hub down / edge error without CORS headers) —
    // surface the hub, not a bare "Failed to fetch" (exploration 0290).
    throw new ShareClaimError(
      'HUB_UNREACHABLE',
      `The hub issuing this link (${hub}) isn't responding — it may be down or restarting. Try again shortly.`
    )
  }

  const data = (await response.json().catch(() => null)) as
    | (ShareClaimResult & { code?: string; error?: string })
    | null

  if (!response.ok || !data || typeof data.resource !== 'string') {
    const code = data?.code ?? `HTTP_${response.status}`
    throw new ShareClaimError(code, data?.error ?? shareClaimErrorMessage(code))
  }

  return {
    resource: data.resource,
    docType: data.docType,
    role: data.role,
    endpoint: data.endpoint
  }
}

export function shareClaimErrorMessage(code: string): string {
  switch (code) {
    case 'LINK_REVOKED':
      return 'This share link has been disabled. Ask the person who shared it for a new one.'
    case 'LINK_EXPIRED':
      return 'This share link has expired. Ask the person who shared it for a new one.'
    case 'LINK_EXHAUSTED':
      return 'This share link has reached its use limit. Ask the person who shared it for a new one.'
    case 'LINK_NOT_FOUND':
      return 'This share link does not exist on its hub. It may have been deleted.'
    case 'BAD_SECRET':
      return 'This share link is missing or has a corrupted secret. Copy the full link and try again.'
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a minute and try again.'
    case 'HUB_UNREACHABLE':
      return "The hub issuing this link isn't responding — it may be down or restarting. Try again shortly."
    default:
      return 'The share link could not be claimed.'
  }
}

/** Human-readable text for any claim failure. */
export function claimErrorText(err: unknown): string {
  if (err instanceof ShareClaimError) return shareClaimErrorMessage(err.code)
  return err instanceof Error ? err.message : String(err)
}

export type ClaimDestination = { kind: 'navigate' } | { kind: 'switch-hub'; endpoint: string }

/**
 * Where a successful claim should take the user: same-hub claims navigate
 * in-SPA (the doc syncs over the existing connection); cross-hub claims
 * need a reload against the issuing hub.
 */
export function decideClaimDestination(
  resultEndpoint: string,
  linkHub: string,
  currentHubUrl: string | null
): ClaimDestination {
  const linkHubWs = normalizeHubWsUrl(resultEndpoint || linkHub)
  const sameHub = currentHubUrl !== null && normalizeHubWsUrl(currentHubUrl) === linkHubWs
  return sameHub ? { kind: 'navigate' } : { kind: 'switch-hub', endpoint: linkHubWs }
}

export type ShareRouteInput =
  | { kind: 'link'; value: ShareLinkInput }
  | { kind: 'handle'; value: string }
  | { kind: 'payload'; value: string }
  | { kind: 'missing'; value: '' }

const readParam = (
  hashParams: URLSearchParams,
  searchParams: URLSearchParams,
  name: string
): string => hashParams.get(name) ?? searchParams.get(name) ?? ''

const readLinkInput = (
  hash: string,
  hashParams: URLSearchParams,
  searchParams: URLSearchParams
): ShareLinkInput | null => {
  const linkId = readParam(hashParams, searchParams, 'link')
  const hub = readParam(hashParams, searchParams, 'hub')
  // Path-routed deployments carry the secret in a plain #s= fragment;
  // hash-routed ones carry it inside the hash query.
  const fragmentSecret = !hash.includes('?')
    ? new URLSearchParams(hash.replace(/^#/, '')).get('s')
    : null
  const secret = hashParams.get('s') ?? fragmentSecret ?? ''
  if (!LINK_ID_RE.test(linkId) || !hub || !secret) return null
  return { linkId, hub: normalizeHubHttpUrl(hub), secret }
}

/**
 * Parse the /share route's inputs from a window location. Query params live
 * in the hash query under hash routing and in the search string otherwise.
 */
export function parseShareRouteInput(location: { hash: string; href: string }): ShareRouteInput {
  const hash = location.hash
  const hashQuery = hash.includes('?') ? hash.split('?')[1] : ''
  const hashParams = new URLSearchParams(hashQuery)
  const searchParams = new URL(location.href).searchParams

  if (readParam(hashParams, searchParams, 'link')) {
    const value = readLinkInput(hash, hashParams, searchParams)
    return value ? { kind: 'link', value } : { kind: 'missing', value: '' }
  }

  const handle = readParam(hashParams, searchParams, 'handle')
  if (handle) return { kind: 'handle', value: handle }
  const payload = readParam(hashParams, searchParams, 'payload')
  if (payload) return { kind: 'payload', value: payload }
  return { kind: 'missing', value: '' }
}

/**
 * Authenticated JSON request against a hub's HTTP API. Throws with the
 * hub's error text when the response is not OK.
 */
export async function hubApiFetch(
  hubHttpUrl: string,
  authToken: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${hubHttpUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store'
    })
  } catch {
    // fetch() rejects with a bare TypeError ("Failed to fetch") for every
    // network-layer failure — including an edge 502 served without CORS
    // headers while the hub is down (exploration 0290). Name the hub so the
    // user sees an outage, not a mystery.
    throw new Error(
      `Your hub (${hubHttpUrl}) isn't responding — it may be down or restarting. Try again shortly.`
    )
  }
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) {
    throw new Error(data?.error ?? `Hub request failed (${response.status})`)
  }
  return data
}

/** Route descriptor for a claimed doc. */
export function docRouteFor(
  docType: ShareClaimResult['docType'],
  resource: string
): { to: string; params: Record<string, string> } {
  switch (docType) {
    case 'database':
      return { to: '/db/$dbId', params: { dbId: resource } }
    case 'canvas':
      return { to: '/canvas/$canvasId', params: { canvasId: resource } }
    case 'dashboard':
      return { to: '/dashboard/$dashboardId', params: { dashboardId: resource } }
    case 'view':
      return { to: '/view/$viewId', params: { viewId: resource } }
    case 'space':
      return { to: '/space/$spaceId', params: { spaceId: resource } }
    case 'workspace':
      // Workspaces have no viewer route; land home — the granted node syncs
      // and appears in the receiver's workspace switcher (0280).
      return { to: '/', params: {} }
    case 'channel':
      return { to: '/channel/$channelId', params: { channelId: resource } }
    default:
      return { to: '/doc/$docId', params: { docId: resource } }
  }
}

/** Map a coarse share-link role onto a Space role for a claimed membership. */
export function spaceRoleFromShareRole(
  role: ShareClaimResult['role']
): 'viewer' | 'commenter' | 'member' {
  if (role === 'read') return 'viewer'
  if (role === 'comment') return 'commenter'
  return 'member'
}

/** Hosts that are only reachable from the issuing machine or LAN. */
export function isPrivateHubHost(hubUrl: string): boolean {
  try {
    const { hostname } = new URL(normalizeHubHttpUrl(hubUrl))
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}
