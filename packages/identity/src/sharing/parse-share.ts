/**
 * @xnet/identity/sharing - Parse and validate share links
 */
import { verifyUCAN } from '../ucan'
import type { ShareData, SharePermission } from './types'

// ─── Parsed Share Result ─────────────────────────────────────

export interface ParsedShare {
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
}

/**
 * Parse a share link or the encoded share data portion.
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

  return {
    resource: data.r,
    token: data.u,
    hubUrl: data.h ?? null,
    issuer: payload.iss,
    audience: payload.aud,
    expiresAt: payload.exp * 1000,
    permissions
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

// ─── Helpers ─────────────────────────────────────────────────

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return atob(base64)
}
