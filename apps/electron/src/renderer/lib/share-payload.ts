/**
 * Share payload helpers for secure share links.
 */

export type ShareDocType = 'page' | 'database' | 'canvas'

export type SharePayloadV2 = {
  v: 2
  resource: string
  docType: ShareDocType
  endpoint: string
  token: string
  exp: number
  transportHints?: {
    ws?: boolean
    webrtc?: boolean
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }
}

export type ParsedShareInput =
  | { kind: 'legacy'; docType: ShareDocType; docId: string }
  | { kind: 'v2'; payload: SharePayloadV2; encodedPayload: string }

const DEFAULT_SHARE_BASE_URL = 'https://xnet.fyi'
const SHARE_BRIDGE_PATH = '/app/share'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

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
  options?: { baseUrl?: string }
): string {
  const encodedPayload = encodeSharePayloadV2(payload)
  const baseUrl = options?.baseUrl ?? DEFAULT_SHARE_BASE_URL
  return `${baseUrl}${SHARE_BRIDGE_PATH}?payload=${encodeURIComponent(encodedPayload)}`
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

  try {
    const encodedPayload = extractPayload(normalized)
    const payload = decodeSharePayloadV2(encodedPayload)
    if (payload.exp <= Date.now()) {
      throw new Error('Share link has expired')
    }

    return {
      kind: 'v2',
      payload,
      encodedPayload
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

function extractPayload(input: string): string {
  if (!input.includes('://')) {
    return input
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('Invalid share URL')
  }

  const payload = parsed.searchParams.get('payload')
  if (!payload) {
    throw new Error('Share URL is missing payload')
  }
  return payload
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
  if (!payload.token || typeof payload.token !== 'string') {
    throw new Error('Share payload missing token')
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= 0) {
    throw new Error('Share payload has invalid expiry')
  }
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
