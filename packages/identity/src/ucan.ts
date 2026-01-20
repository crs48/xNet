/**
 * UCAN (User Controlled Authorization Networks) token implementation
 */
import { sign, verify } from '@xnet/crypto'
import type { UCANToken, UCANCapability } from './types'
import { parseDID } from './did'

/**
 * Options for creating a UCAN token
 */
export interface CreateUCANOptions {
  issuer: string // Issuer DID
  issuerKey: Uint8Array // Issuer private key
  audience: string // Audience DID
  capabilities: UCANCapability[]
  expiration?: number // Unix timestamp (default: 1 hour from now)
  proofs?: string[] // Parent UCAN tokens
}

/**
 * Result of verifying a UCAN token
 */
export interface VerifyResult {
  valid: boolean
  payload?: UCANToken
  error?: string
}

/**
 * Create a UCAN token
 */
export function createUCAN(options: CreateUCANOptions): string {
  const {
    issuer,
    issuerKey,
    audience,
    capabilities,
    expiration = Math.floor(Date.now() / 1000) + 3600, // 1 hour default
    proofs = []
  } = options

  const payload = {
    iss: issuer,
    aud: audience,
    exp: expiration,
    att: capabilities,
    prf: proofs
  }

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const signature = sign(payloadBytes, issuerKey)

  // Encode as JWT-like format (header.payload.signature)
  const header = toBase64Url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify(payload))
  const sig = toBase64UrlBytes(signature)

  return `${header}.${body}.${sig}`
}

/**
 * Verify a UCAN token
 */
export function verifyUCAN(token: string): VerifyResult {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' }
    }

    const [, body, sig] = parts
    const payload = JSON.parse(fromBase64Url(body))
    const signature = fromBase64UrlBytes(sig)

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' }
    }

    // Get issuer's public key from DID
    const publicKey = parseDID(payload.iss)

    // Verify signature
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify({
        iss: payload.iss,
        aud: payload.aud,
        exp: payload.exp,
        att: payload.att,
        prf: payload.prf
      })
    )

    if (!verify(payloadBytes, signature, publicKey)) {
      return { valid: false, error: 'Invalid signature' }
    }

    return {
      valid: true,
      payload: {
        ...payload,
        sig: signature
      }
    }
  } catch (e) {
    return { valid: false, error: `Parse error: ${e}` }
  }
}

/**
 * Check if a UCAN token has a specific capability
 */
export function hasCapability(token: UCANToken, resource: string, action: string): boolean {
  return token.att.some(
    (cap) => (cap.with === resource || cap.with === '*') && (cap.can === action || cap.can === '*')
  )
}

/**
 * Get all capabilities from a UCAN token
 */
export function getCapabilities(token: UCANToken): UCANCapability[] {
  return token.att
}

/**
 * Check if a UCAN token is expired
 */
export function isExpired(token: UCANToken): boolean {
  return token.exp < Math.floor(Date.now() / 1000)
}

// Helper functions for base64url encoding
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return atob(base64)
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function fromBase64UrlBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}
