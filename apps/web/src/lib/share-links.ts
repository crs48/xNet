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
  docType: 'page' | 'database' | 'canvas' | 'dashboard' | 'view'
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
  const response = await fetch(`${hub}/shares/links/${encodeURIComponent(input.linkId)}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ secret: input.secret }),
    cache: 'no-store'
  })

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
    default:
      return 'The share link could not be claimed.'
  }
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
    default:
      return { to: '/doc/$docId', params: { docId: resource } }
  }
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
