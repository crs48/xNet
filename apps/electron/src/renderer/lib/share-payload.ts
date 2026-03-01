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
  | { kind: 'legacy'; docType: ShareDocType; docId: string }
  | { kind: 'handle'; handle: string }
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

export function parseShareInput(input: string): ParsedShareInput {
  const normalized = input.trim()
  if (!normalized) {
    throw new Error('Please enter a share link or payload')
  }

  const legacy = parseLegacyShare(normalized)
  if (legacy && normalized.includes(':')) {
    return legacy
  }

  const directHandle = parseShareHandle(normalized)
  if (directHandle) {
    return { kind: 'handle', handle: directHandle }
  }

  try {
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
  } catch (error) {
    if (
      legacy &&
      error instanceof Error &&
      (error.message === 'Invalid share payload encoding' || error.message === 'Invalid share URL')
    ) {
      return legacy
    }
    throw error
  }
}

function parseLegacyShare(
  input: string
): { kind: 'legacy'; docType: ShareDocType; docId: string } | null {
  if (!input.includes(':')) {
    if (input.length >= 8) {
      return { kind: 'legacy', docType: 'page', docId: input }
    }
    return null
  }

  const [prefix, ...rest] = input.split(':')
  const docId = rest.join(':').trim()
  if (!docId) return null
  if (prefix === 'page' || prefix === 'database' || prefix === 'canvas') {
    return { kind: 'legacy', docType: prefix, docId }
  }
  return null
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
