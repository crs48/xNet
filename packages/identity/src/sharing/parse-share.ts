/**
 * @xnet/identity/sharing - Parse and validate share links
 */
import { verifyUCAN } from '../ucan'
import { fromBase64Url } from './base64url'
import type { ShareData, SharePermission } from './types'

// ─── Parsed Share Result ─────────────────────────────────────

export type ParsedShare = {
  /** Resource URI */
  resource: string

  /** UCAN token */
  token: string

  /** Hub URL (if included) */
  hubUrl: string | null

  /** Issuer DID (from UCAN) */
  issuer: string

  /** Audience DID (from UCAN) */
  audience: string

  /** Expiration (ms since epoch) */
  expiresAt: number

  /** Permissions granted */
  permissions: SharePermission[]

  /** Whether the token has expired */
  expired: boolean
}

/**
 * Parse a share link or the encoded share data portion.
 *
 * **WARNING: The returned data is NOT verified.** The UCAN signature is not
 * checked — all fields (issuer, audience, permissions) come from the
 * unverified token payload. Always call `verifyShareToken(parsed.token)`
 * before trusting any values.
 *
 * Accepts either:
 * - Full URL: "https://xnet.fyi/s/eyJ..."
 * - Just the encoded data: "eyJ..."
 *
 * @throws {Error} If the share data is malformed
 */
export function parseShareLink(input: string): ParsedShare {
  // Extract the encoded data
  let encoded = input
  const pathPrefix = '/s/'
  const pathIndex = input.indexOf(pathPrefix)
  if (pathIndex !== -1) {
    encoded = input.slice(pathIndex + pathPrefix.length)
  }
  // Strip query params and hash fragments if present
  const qIndex = encoded.indexOf('?')
  if (qIndex !== -1) encoded = encoded.slice(0, qIndex)
  const hIndex = encoded.indexOf('#')
  if (hIndex !== -1) encoded = encoded.slice(0, hIndex)

  // Decode
  let data: ShareData
  try {
    const json = fromBase64Url(encoded)
    data = JSON.parse(json) as ShareData
  } catch {
    throw new Error('Invalid share link: cannot decode data')
  }

  // Validate version
  if (data.v !== 1) {
    throw new Error(`Unsupported share link version: ${data.v}`)
  }

  if (!data.r || typeof data.r !== 'string') {
    throw new Error('Invalid share link: missing resource')
  }

  if (!data.u || typeof data.u !== 'string') {
    throw new Error('Invalid share link: missing token')
  }

  // Parse the UCAN to extract metadata
  const ucanParts = data.u.split('.')
  if (ucanParts.length !== 3) {
    throw new Error('Invalid share link: malformed UCAN token')
  }

  let payload: { iss: string; aud: string; exp: number; att: Array<{ with: string; can: string }> }
  try {
    payload = JSON.parse(fromBase64Url(ucanParts[1]))
  } catch {
    throw new Error('Invalid share link: cannot decode UCAN payload')
  }

  // Extract permissions from capabilities
  const permissions: SharePermission[] = []
  for (const cap of payload.att) {
    if (cap.with === data.r || cap.with === '*') {
      if (cap.can === 'xnet/read' && !permissions.includes('read')) {
        permissions.push('read')
      }
      if (cap.can === 'xnet/write' && !permissions.includes('write')) {
        permissions.push('write')
      }
      if (cap.can === 'xnet/admin' && !permissions.includes('admin')) {
        permissions.push('admin')
      }
    }
  }

  const expiresAt = payload.exp * 1000
  const expired = expiresAt < Date.now()

  return {
    resource: data.r,
    token: data.u,
    hubUrl: data.h ?? null,
    issuer: payload.iss,
    audience: payload.aud,
    expiresAt,
    permissions,
    expired
  }
}

/**
 * Parse and verify a share link in one step.
 *
 * Parses the link data and verifies the UCAN signature + expiry.
 * Returns the parsed share data along with verification status.
 */
export function parseAndVerifyShareLink(input: string): ParsedShare & {
  valid: boolean
  error?: string
} {
  const parsed = parseShareLink(input)
  const verification = verifyShareToken(parsed.token)
  return {
    ...parsed,
    valid: verification.valid,
    error: verification.error
  }
}

/**
 * Verify a share token is valid (not expired, properly signed).
 */
export function verifyShareToken(token: string): {
  valid: boolean
  error?: string
} {
  const result = verifyUCAN(token)
  return {
    valid: result.valid,
    error: result.error
  }
}
