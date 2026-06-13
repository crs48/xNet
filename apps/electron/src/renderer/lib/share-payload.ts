/**
 * Share payload helpers for secure share links.
 */

export type ShareDocType = 'page' | 'database' | 'canvas'

export type SharePayloadV2 = {
  v: 2
  resource: string
  docType: ShareDocType
  endpoint: string
  token?: string
  handle?: string
  endpointClaim?: string
  exp: number
  transportHints?: {
    ws?: boolean
    webrtc?: boolean
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }
}

export type ParsedShareInput =
  | { kind: 'handle'; handle: string }
  | { kind: 'link'; linkId: string; hub: string; secret: string }
  | { kind: 'v2'; payload: SharePayloadV2; encodedPayload: string; securityWarnings?: string[] }

const DEFAULT_SHARE_BASE_URL = 'https://xnet.fyi/app'
const DEFAULT_SHARE_PATH = '/share'

export type BuildShareUrlOptions = {
  baseUrl?: string
  sharePath?: string
  useHashRouting?: boolean
}

export type BuildShareHandleUrlOptions = BuildShareUrlOptions & {
  handle: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const DEFAULT_ALLOWED_ENDPOINT_HOSTS = ['xnet.fyi', 'hub.xnet.fyi']
const SHARE_HANDLE_RE = /^sh_[A-Za-z0-9_-]{16,}$/

export function encodeSharePayloadV2(payload: SharePayloadV2): string {
  validateSharePayloadV2(payload)
  const json = JSON.stringify(payload)
  return toBase64Url(json)
}

export function decodeSharePayloadV2(encodedPayload: string): SharePayloadV2 {
  let decoded: SharePayloadV2
  try {
    const json = fromBase64Url(encodedPayload)
    decoded = JSON.parse(json) as SharePayloadV2
  } catch {
    throw new Error('Invalid share payload encoding')
  }

  validateSharePayloadV2(decoded)
  return decoded
}

export function buildUniversalShareUrl(
  payload: SharePayloadV2,
  options?: BuildShareUrlOptions
): string {
  const encodedPayload = encodeSharePayloadV2(payload)
  const baseUrl = options?.baseUrl ?? DEFAULT_SHARE_BASE_URL
  const sharePath = options?.sharePath ?? DEFAULT_SHARE_PATH
  if (options?.useHashRouting) {
    return `${baseUrl}#${sharePath}?payload=${encodeURIComponent(encodedPayload)}`
  }
  return `${baseUrl}${sharePath}?payload=${encodeURIComponent(encodedPayload)}`
}

export function buildUniversalShareHandleUrl(options: BuildShareHandleUrlOptions): string {
  const baseUrl = options.baseUrl ?? DEFAULT_SHARE_BASE_URL
  const sharePath = options.sharePath ?? DEFAULT_SHARE_PATH
  if (!SHARE_HANDLE_RE.test(options.handle)) {
    throw new Error('Invalid share handle')
  }
  if (options.useHashRouting) {
    return `${baseUrl}#${sharePath}?handle=${encodeURIComponent(options.handle)}`
  }
  return `${baseUrl}${sharePath}?handle=${encodeURIComponent(options.handle)}`
}

const SHARE_LINK_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

const normalizeShareHubHttpUrl = (url: string): string =>
  url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')

type ParsedShareLink = { kind: 'link'; linkId: string; hub: string; secret: string }

const parseHttpsShareLink = (url: URL, secret: string): ParsedShareLink | null => {
  const match = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{8,64})$/)
  if (!match || !secret) return null
  return { kind: 'link', linkId: match[1], hub: `${url.protocol}//${url.host}`, secret }
}

const stringParam = (params: URLSearchParams, name: string): string => {
  const value = params.get(name)
  return value === null ? '' : value
}

const hasShareLinkParts = (linkId: string, hub: string, secret: string): boolean =>
  SHARE_LINK_ID_RE.test(linkId) && Boolean(hub) && Boolean(secret)

const parseXnetShareLink = (url: URL, secret: string): ParsedShareLink | null => {
  const linkId = stringParam(url.searchParams, 'link')
  const hub = stringParam(url.searchParams, 'hub')
  if (url.hostname !== 'share' || !hasShareLinkParts(linkId, hub, secret)) return null
  return { kind: 'link', linkId, hub: normalizeShareHubHttpUrl(hub), secret }
}

const secretFromUrlHash = (url: URL): string =>
  stringParam(new URLSearchParams(url.hash.replace(/^#/, '')), 's')

/**
 * Parse durable share-link URLs (exploration 0169):
 * `https://<hub>/s/<linkId>#s=<secret>` or
 * `xnet://share?link=<linkId>&hub=<hubUrl>#s=<secret>`.
 */
function parseShareLinkUrl(input: string): ParsedShareLink | null {
  try {
    const url = new URL(input)
    const secret = secretFromUrlHash(url)
    if (HTTP_PROTOCOLS.has(url.protocol)) return parseHttpsShareLink(url, secret)
    if (url.protocol === 'xnet:') return parseXnetShareLink(url, secret)
    return null
  } catch {
    return null
  }
}

export type ShareLinkClaimResult = {
  resource: string
  docType: 'page' | 'database' | 'canvas' | 'dashboard' | 'view'
  role: 'read' | 'comment' | 'write'
  endpoint: string
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const errorTextOf = (body: unknown, fallback: string): string => {
  const error = asRecord(body).error
  return typeof error === 'string' ? error : fallback
}

const parseClaimResponse = (
  ok: boolean,
  data: (ShareLinkClaimResult & { error?: string }) | { error?: string } | null
): ShareLinkClaimResult => {
  if (ok && data && 'resource' in data) {
    return data
  }
  throw new Error(errorTextOf(data, 'Share link could not be claimed'))
}

/** Claim a durable share link, recording a grant for this identity. */
export async function claimShareLink(
  link: { linkId: string; hub: string; secret: string },
  authToken: string
): Promise<ShareLinkClaimResult> {
  const hub = normalizeShareHubHttpUrl(link.hub)
  const response = await fetch(`${hub}/shares/links/${encodeURIComponent(link.linkId)}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ secret: link.secret }),
    cache: 'no-store'
  })

  const data = (await response.json().catch(() => null)) as
    | (ShareLinkClaimResult & { error?: string })
    | { error?: string }
    | null

  return parseClaimResponse(response.ok, data)
}

// ─── Add-shared resolution (exploration 0169) ────────────────────────────────

export type ResolvedShareAdd = {
  docType: 'page' | 'database' | 'canvas'
  docId: string
  share?: {
    endpoint: string
    token: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }
}

/** Security notice text for inputs that had ICE policy warnings. */
export const describeShareSecurityNotice = (parsed: ParsedShareInput): string | null =>
  parsed.kind === 'v2' && parsed.securityWarnings?.length ? parsed.securityWarnings.join(' ') : null

const DESKTOP_DOC_TYPES = new Set(['page', 'database', 'canvas'])

const claimLinkToAdd = async (
  link: { linkId: string; hub: string; secret: string },
  getHubAuthToken?: () => Promise<string>
): Promise<ResolvedShareAdd> => {
  if (!getHubAuthToken) {
    throw new Error('Hub authentication is not available')
  }
  const token = await getHubAuthToken()
  const claimed = await claimShareLink(link, token)
  if (!DESKTOP_DOC_TYPES.has(claimed.docType)) {
    throw new Error(
      `This link shares a ${claimed.docType}, which is not supported on desktop yet — open it on the web app.`
    )
  }
  return {
    docType: claimed.docType as ResolvedShareAdd['docType'],
    docId: claimed.resource,
    share: { endpoint: claimed.endpoint, token, transport: 'ws' }
  }
}

type RedeemedHandle = {
  endpoint: string
  token: string
  resource: string
  docType: 'page' | 'database' | 'canvas'
  exp: number
}

const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: 'This secure link expired. Ask the owner to generate a new link.',
  TOKEN_REPLAYED: 'This secure link was already used. Ask the owner to generate a fresh link.',
  INVALID_HANDLE: 'This secure link is invalid. Copy it again or ask the owner for a new link.'
}

export const redeemErrorMessage = (body: unknown): string => {
  const byCode = REDEEM_ERROR_MESSAGES[String(asRecord(body).code)]
  return typeof byCode === 'string'
    ? byCode
    : errorTextOf(body, 'Secure share link could not be redeemed')
}

const assertRedeemedHandle = (ok: boolean, body: unknown): RedeemedHandle => {
  if (!ok || !body || !('endpoint' in (body as Record<string, unknown>))) {
    throw new Error(redeemErrorMessage(body))
  }
  return body as RedeemedHandle
}

const assertRedeemedFresh = (redeemed: RedeemedHandle): RedeemedHandle => {
  if (!redeemed.token || redeemed.exp <= Date.now()) {
    throw new Error('Secure share session is expired')
  }
  return redeemed
}

const redeemHandleToAdd = async (
  handle: string,
  hubHttpUrl: string | null
): Promise<ResolvedShareAdd> => {
  if (!hubHttpUrl) {
    throw new Error('Hub URL is not configured for secure share redemption')
  }
  const response = await fetch(`${hubHttpUrl}/shares/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle })
  })
  const body = (await response.json().catch(() => null)) as unknown
  const redeemed = assertRedeemedFresh(assertRedeemedHandle(response.ok, body))
  return {
    docType: redeemed.docType,
    docId: redeemed.resource,
    share: { endpoint: redeemed.endpoint, token: redeemed.token, transport: 'ws' }
  }
}

const transportForHints = (hints: SharePayloadV2['transportHints']): 'ws' | 'auto' =>
  hints?.webrtc ? 'auto' : 'ws'

const payloadToAdd = (payload: SharePayloadV2): ResolvedShareAdd => {
  if (!payload.token) {
    throw new Error('Secure share payload is missing token material')
  }
  const hints = payload.transportHints
  return {
    docType: payload.docType,
    docId: payload.resource,
    share: {
      endpoint: payload.endpoint,
      token: payload.token,
      transport: transportForHints(hints),
      iceServers: hints === undefined ? undefined : hints.iceServers
    }
  }
}

/** Turn any parsed share input into the AddShared call the shell expects. */
export const resolveShareInputToAdd = async (
  parsed: ParsedShareInput,
  deps: { hubHttpUrl: string | null; getHubAuthToken?: () => Promise<string> }
): Promise<ResolvedShareAdd> => {
  switch (parsed.kind) {
    case 'link':
      return claimLinkToAdd(parsed, deps.getHubAuthToken)
    case 'handle':
      return redeemHandleToAdd(parsed.handle, deps.hubHttpUrl)
    default:
      return payloadToAdd(parsed.payload)
  }
}

export function parseShareInput(input: string): ParsedShareInput {
  const normalized = input.trim()
  if (!normalized) {
    throw new Error('Please enter a share link or payload')
  }

  const shareLink = parseShareLinkUrl(normalized)
  if (shareLink) {
    return shareLink
  }

  // Naked `type:id` sharing was removed with durable share links
  // (exploration 0169) — point people at the new URL form.
  if (/^(page|database|canvas):/.test(normalized)) {
    throw new Error(
      'Document-ID sharing has been replaced by share links. Ask for a link like https://hub.xnet.fyi/s/…'
    )
  }

  const directHandle = parseShareHandle(normalized)
  if (directHandle) {
    return { kind: 'handle', handle: directHandle }
  }

  const extracted = extractPayload(normalized)
  if (extracted.kind === 'handle') {
    return extracted
  }
  const encodedPayload = extracted.encodedPayload
  const payload = decodeSharePayloadV2(encodedPayload)
  if (payload.exp <= Date.now()) {
    throw new Error('Share link has expired')
  }

  const sanitizedIceResult = sanitizeInboundIceServers(payload.transportHints?.iceServers)
  const securityWarnings: string[] = []
  if (sanitizedIceResult.droppedCount > 0) {
    securityWarnings.push(
      `Ignored ${sanitizedIceResult.droppedCount} unapproved ICE URL${sanitizedIceResult.droppedCount === 1 ? '' : 's'} from share link.`
    )
  }
  if (sanitizedIceResult.reorderedForRelaySecurity) {
    securityWarnings.push('Reordered ICE candidates to prefer TURN over TLS relay paths.')
  }

  const sanitizedPayload: SharePayloadV2 = {
    ...payload,
    transportHints: payload.transportHints
      ? {
          ...payload.transportHints,
          iceServers: sanitizedIceResult.iceServers
        }
      : undefined
  }

  return {
    kind: 'v2',
    payload: sanitizedPayload,
    encodedPayload,
    securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined
  }
}

function extractPayload(
  input: string
): { kind: 'payload'; encodedPayload: string } | { kind: 'handle'; handle: string } {
  const directHandle = parseShareHandle(input)
  if (directHandle) {
    return { kind: 'handle', handle: directHandle }
  }

  if (!input.includes('://')) {
    return { kind: 'payload', encodedPayload: input }
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('Invalid share URL')
  }

  const handle = parsed.searchParams.get('handle')
  if (handle) {
    const normalized = handle.trim()
    if (!SHARE_HANDLE_RE.test(normalized)) {
      throw new Error('Share URL has invalid handle')
    }
    return { kind: 'handle', handle: normalized }
  }

  const payload = parsed.searchParams.get('payload')
  if (!payload) {
    throw new Error('Share URL is missing payload or handle')
  }
  return { kind: 'payload', encodedPayload: payload }
}

function parseShareHandle(input: string): string | null {
  const normalized = input.trim()
  if (!normalized) {
    return null
  }
  return SHARE_HANDLE_RE.test(normalized) ? normalized : null
}

function validateSharePayloadV2(payload: SharePayloadV2): void {
  if (!payload || payload.v !== 2) {
    throw new Error('Unsupported share payload version')
  }
  if (!payload.resource || typeof payload.resource !== 'string') {
    throw new Error('Share payload missing resource')
  }
  if (
    payload.docType !== 'page' &&
    payload.docType !== 'database' &&
    payload.docType !== 'canvas'
  ) {
    throw new Error('Share payload has invalid docType')
  }
  if (!payload.endpoint || typeof payload.endpoint !== 'string') {
    throw new Error('Share payload missing endpoint')
  }
  if (!validateEndpointPolicy(payload.endpoint)) {
    throw new Error('Share payload endpoint is not trusted')
  }
  const hasToken = typeof payload.token === 'string' && payload.token.length > 0
  const hasHandle = typeof payload.handle === 'string' && SHARE_HANDLE_RE.test(payload.handle)
  if (!hasToken && !hasHandle) {
    throw new Error('Share payload missing token or handle')
  }
  if (typeof payload.endpointClaim !== 'undefined' && payload.endpointClaim.length === 0) {
    throw new Error('Share payload has invalid endpoint claim')
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= 0) {
    throw new Error('Share payload has invalid expiry')
  }

  if (payload.transportHints && typeof payload.transportHints !== 'object') {
    throw new Error('Share payload has invalid transport hints')
  }

  const iceServers = payload.transportHints?.iceServers
  if (iceServers && !Array.isArray(iceServers)) {
    throw new Error('Share payload has invalid ICE server configuration')
  }
  if (Array.isArray(iceServers)) {
    for (const server of iceServers) {
      if (!server || typeof server !== 'object' || !Array.isArray(server.urls)) {
        throw new Error('Share payload has invalid ICE server configuration')
      }
      for (const url of server.urls) {
        if (typeof url !== 'string' || url.length === 0) {
          throw new Error('Share payload has invalid ICE server configuration')
        }
      }
      if (
        typeof server.username !== 'undefined' &&
        (typeof server.username !== 'string' || server.username.length === 0)
      ) {
        throw new Error('Share payload has invalid ICE server configuration')
      }
      if (
        typeof server.credential !== 'undefined' &&
        (typeof server.credential !== 'string' || server.credential.length === 0)
      ) {
        throw new Error('Share payload has invalid ICE server configuration')
      }
    }
  }
}

function validateEndpointPolicy(endpoint: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    return false
  }

  if (parsed.protocol === 'ws:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  }
  if (parsed.protocol !== 'wss:') {
    return false
  }

  const allowedHosts = getAllowedEndpointHosts()
  return allowedHosts.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
  )
}

function getAllowedEndpointHosts(): string[] {
  const fromEnv =
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.XNET_ALLOWED_SHARE_ENDPOINTS === 'string'
      ? process.env.XNET_ALLOWED_SHARE_ENDPOINTS
      : ''

  const configured = fromEnv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

  if (configured.length > 0) {
    return configured
  }
  return DEFAULT_ALLOWED_ENDPOINT_HOSTS
}

function sanitizeInboundIceServers(
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }> | undefined
): {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }> | undefined
  droppedCount: number
  reorderedForRelaySecurity: boolean
} {
  if (!Array.isArray(iceServers) || iceServers.length === 0) {
    return {
      iceServers: undefined,
      droppedCount: 0,
      reorderedForRelaySecurity: false
    }
  }

  const allowedIceHosts =
    typeof process !== 'undefined' &&
    process.env &&
    typeof process.env.XNET_ALLOWED_ICE_HOSTS === 'string'
      ? process.env.XNET_ALLOWED_ICE_HOSTS.split(',')
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)
      : []

  const totalInboundUrlCount = iceServers.reduce((count, server) => count + server.urls.length, 0)

  if (allowedIceHosts.length === 0) {
    return {
      iceServers: undefined,
      droppedCount: totalInboundUrlCount,
      reorderedForRelaySecurity: false
    }
  }

  const normalized: Array<{ urls: string[]; username?: string; credential?: string }> = []
  let reorderedForRelaySecurity = false
  for (const server of iceServers) {
    const filteredUrls = server.urls.filter((raw) => isAllowedIceUrl(raw, allowedIceHosts))
    const urls = prioritizeRelaySecureIceUrls(filteredUrls)
    if (!reorderedForRelaySecurity && filteredUrls.length > 1) {
      reorderedForRelaySecurity = !sameStringArray(filteredUrls, urls)
    }
    if (urls.length === 0) {
      continue
    }
    normalized.push({
      urls,
      username: server.username,
      credential: server.credential
    })
  }

  const allowedUrlCount = normalized.reduce((count, server) => count + server.urls.length, 0)
  return {
    iceServers: normalized.length > 0 ? normalized : undefined,
    droppedCount: Math.max(0, totalInboundUrlCount - allowedUrlCount),
    reorderedForRelaySecurity
  }
}

function prioritizeRelaySecureIceUrls(urls: string[]): string[] {
  if (urls.length <= 1) {
    return urls
  }

  return [...urls].sort((left, right) => scoreIceUrlForRelay(left) - scoreIceUrlForRelay(right))
}

function scoreIceUrlForRelay(raw: string): number {
  const normalized = raw.trim().toLowerCase()
  if (normalized.startsWith('turns:')) {
    return 0
  }
  if (normalized.startsWith('turn:')) {
    return normalized.includes('transport=tcp') ? 1 : 2
  }
  if (normalized.startsWith('stun:')) {
    return 3
  }
  return 4
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

function isAllowedIceUrl(raw: string, allowHosts: string[]): boolean {
  const match = raw.match(/^[a-z]+:(?:\/\/)?([^/?]+)/i)
  if (!match) {
    return false
  }
  const hostWithPort = match[1].toLowerCase()
  const host = hostWithPort.includes(':') ? hostWithPort.split(':')[0] : hostWithPort
  return allowHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

function toBase64Url(str: string): string {
  const bytes = textEncoder.encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return textDecoder.decode(bytes)
}
