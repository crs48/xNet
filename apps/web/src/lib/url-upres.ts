/**
 * URL classification for link up-res (exploration 0295).
 *
 * Decides what a URL pasted into chat/comments points at: an internal
 * workspace node (app deep link or xnet:// URI), an xNet share link, or an
 * external site. Pure — the accepting hosts are passed in, so the composer
 * and render surfaces classify identically and everything is testable.
 */

export type UrlClass =
  | { kind: 'internal'; nodeKind: string; nodeId: string }
  | { kind: 'share'; linkId: string; hubUrl: string; secret: string | null }
  | { kind: 'external'; url: string }

export interface UrlEnv {
  /** Hosts (host[:port]) the web app is served from */
  appHosts: readonly string[]
  /** Hub hosts trusted to mint share links (used for secret-less share URLs) */
  hubHosts: readonly string[]
}

const LINK_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

/**
 * Route segment → node kind, mirroring `navigateToNode` / `docRouteFor`.
 * Kinds match `WikilinkTarget.kind` where the [[ picker covers them.
 */
const ROUTE_KINDS: Record<string, string> = {
  doc: 'page',
  db: 'database',
  canvas: 'canvas',
  dashboard: 'dashboard',
  view: 'savedview',
  map: 'map',
  channel: 'channel',
  tag: 'tag',
  space: 'space'
}

const secretFromHash = (hash: string): string | null => {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get('s')
}

/** `/doc/<id>` (or hash-routed `#/doc/<id>`) → { nodeKind, nodeId }. */
function parseRoutePath(path: string): { nodeKind: string; nodeId: string } | null {
  const match = path.match(/^\/([a-z]+)\/([^/?#]+)$/)
  if (!match) return null
  const nodeKind = ROUTE_KINDS[match[1]]
  if (!nodeKind) return null
  return { nodeKind, nodeId: decodeURIComponent(match[2]) }
}

/**
 * Parse an app deep link (`https://<app-host>/app/#/doc/<id>` under hash
 * routing, `https://<app-host>/doc/<id>` under path routing) into a node
 * reference. Only URLs on one of `appHosts` qualify.
 */
export function parseAppDeepLink(
  raw: string,
  appHosts: readonly string[]
): { nodeKind: string; nodeId: string } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!appHosts.includes(url.host)) return null

  if (url.hash.startsWith('#/')) {
    // Hash routing: the route lives in the fragment (strip its own query).
    const hashPath = url.hash.slice(1).split('?')[0]
    return parseRoutePath(hashPath)
  }
  return parseRoutePath(url.pathname)
}

/**
 * Classify any URL string. Internal and share classes are only claimed on
 * unambiguous evidence; everything else stays `external`.
 */
export function classifyUrl(raw: string, env: UrlEnv): UrlClass {
  const external: UrlClass = { kind: 'external', url: raw }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return external
  }

  if (url.protocol === 'xnet:') {
    if (url.hostname === 'share') {
      const linkId = url.searchParams.get('link') ?? ''
      const hub = url.searchParams.get('hub') ?? ''
      if (LINK_ID_RE.test(linkId) && hub) {
        return { kind: 'share', linkId, hubUrl: hub, secret: secretFromHash(url.hash) }
      }
      return external
    }
    // xnet://<kind>/<id> reference URIs (0166/0170 chip convention)
    const match = raw.match(/^xnet:\/\/([a-z]+)\/(.+)$/)
    if (match) return { kind: 'internal', nodeKind: match[1], nodeId: match[2] }
    return external
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return external

  // Share links: /s/<linkId>. With the #s= secret this is unambiguous (the
  // canonical form works from any hub host); without it, only trust known
  // hub hosts — an arbitrary site's /s/ path is not a share link.
  const shareMatch = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{8,64})$/)
  if (shareMatch) {
    const secret = secretFromHash(url.hash)
    if (secret || env.hubHosts.includes(url.host)) {
      return {
        kind: 'share',
        linkId: shareMatch[1],
        hubUrl: `${url.protocol}//${url.host}`,
        secret
      }
    }
  }

  const deepLink = parseAppDeepLink(raw, env.appHosts)
  if (deepLink) return { kind: 'internal', ...deepLink }

  return external
}

/** Well-known public app host (GitHub Pages deployment). */
const PUBLIC_APP_HOSTS = ['xnet.fyi']

/**
 * The environment for classification in the running app: the current
 * origin plus the public deployment, and the connected hub (if any).
 */
export function currentUrlEnv(hubHttpUrl: string | null | undefined): UrlEnv {
  const appHosts = new Set<string>(PUBLIC_APP_HOSTS)
  if (typeof window !== 'undefined' && window.location.host) {
    appHosts.add(window.location.host)
  }
  const hubHosts: string[] = []
  if (hubHttpUrl) {
    try {
      hubHosts.push(new URL(hubHttpUrl).host)
    } catch {
      // unparseable hub URL — classify without a trusted hub host
    }
  }
  return { appHosts: [...appHosts], hubHosts }
}
