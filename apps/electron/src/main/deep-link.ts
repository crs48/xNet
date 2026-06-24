/**
 * Deep-link parsing for the `xnet://` custom protocol (main process).
 *
 * Pure, Electron-free helpers so the security-critical validation is unit
 * testable. `index.ts` owns the OS wiring (`open-url`, `second-instance`,
 * single-instance argv scan) and routes a validated URL to the renderer.
 *
 * Today we parse one new shape here — `xnet://connect` — the dashboard "Open in
 * desktop app" handoff. The legacy `xnet://share` form is still parsed inline in
 * `index.ts`.
 *
 * SECURITY: an `xnet://connect` link is an open redirect into a native app — a
 * malicious page could try `xnet://connect?hub=wss://evil.example` to silently
 * repoint a user's sync endpoint. We therefore (a) require `wss://` (never plain
 * `ws://`/`http(s)://`), (b) allowlist the hub host to xNet-owned domains, and
 * (c) reject embedded credentials. The renderer still requires an *explicit user
 * confirmation* before applying the hub — this validation is defence in depth, not
 * the only gate.
 */

const DEEP_LINK_PROTOCOL = 'xnet'

/** xNet-owned hosts a managed hub can live on (the tenant subdomains hang off these). */
const DEFAULT_ALLOWED_HUB_HOSTS = ['xnet.fyi', 'xnet.app']

/** Bound the raw URL + hub value so a pathological link can't blow up the parser. */
const MAX_DEEP_LINK_LENGTH = 2048
const MAX_HUB_LENGTH = 512

/** A validated `xnet://connect` payload handed to the renderer for confirmation. */
export interface CloudConnectPayload {
  /** The managed hub to connect to — always a validated `wss://` URL on an allowlisted host. */
  hub: string
  /** Optional short device/approval code carried for the claim UI (forward-compat). */
  code?: string
}

/**
 * Allowlist of hub hosts. Defaults to xNet-owned domains; overridable for
 * staging/self-host via `XNET_ALLOWED_HUB_HOSTS` (comma-separated bare hosts),
 * mirroring the share-endpoint policy (`XNET_ALLOWED_SHARE_ENDPOINTS`).
 */
function allowedHubHosts(): string[] {
  const fromEnv =
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.XNET_ALLOWED_HUB_HOSTS === 'string'
      ? process.env.XNET_ALLOWED_HUB_HOSTS
      : ''
  const configured = fromEnv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_HUB_HOSTS
}

/**
 * True only for a hub URL safe to hand the renderer: a `wss://` URL, no embedded
 * credentials, on an allowlisted host (exact match or a subdomain of one). Any
 * parse failure, wrong scheme, or off-allowlist host returns false — we never
 * "best effort" a hub the user didn't vet.
 */
export function isAllowedHubUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_HUB_LENGTH) {
    return false
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  // wss only — plain ws:// or http(s):// is never an acceptable managed hub here.
  if (url.protocol !== 'wss:') return false
  // A link carrying credentials (`wss://user:pass@host`) is suspicious; reject it.
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  if (!host) return false
  return allowedHubHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/**
 * Parse + validate an `xnet://connect?hub=<wss-url>&code=<short>` deep link.
 * Returns the payload to confirm in the renderer, or null if the URL is not a
 * well-formed, allowlisted connect link (the caller treats null as "ignore").
 */
export function parseConnectDeepLink(rawUrl: string): CloudConnectPayload | null {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_DEEP_LINK_LENGTH) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:` || parsed.hostname !== 'connect') {
    return null
  }

  const hub = parsed.searchParams.get('hub')
  if (!hub || !isAllowedHubUrl(hub)) {
    return null
  }

  // Optional approval code — keep it short + charset-bounded (Crockford `ABCD-7K2P`
  // shape, case-insensitive). An invalid code is dropped, not fatal: the hub is
  // what matters and the user still confirms.
  const rawCode = parsed.searchParams.get('code')
  const code = rawCode && /^[0-9A-Za-z-]{1,16}$/.test(rawCode) ? rawCode.toUpperCase() : undefined

  return code ? { hub, code } : { hub }
}
