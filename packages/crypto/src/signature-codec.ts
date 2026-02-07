/**
 * Signature encoding/decoding for wire format.
 *
 * Provides both JSON and binary encodings for UnifiedSignature:
 * - JSON: Human-readable, used in UCAN tokens and REST APIs
 * - Binary: Compact, used in Yjs updates and WebRTC
 */

import type { SecurityLevel } from './security-level'
import type { UnifiedSignature } from './unified-signature'
import { ED25519_SIGNATURE_SIZE } from './constants'
import { toBase64, fromBase64 } from './utils'

// ─── JSON Wire Format ────────────────────────────────────────────

/**
 * Wire format for UnifiedSignature (JSON).
 * Used in Change<T> and UCAN tokens.
 */
export interface SignatureWire {
  /** Security level */
  l: SecurityLevel
  /** Ed25519 signature (base64) */
  e?: string
  /** ML-DSA signature (base64) */
  p?: string
}

/**
 * Encode a UnifiedSignature to JSON wire format.
 */
export function encodeSignature(signature: UnifiedSignature): SignatureWire {
  const wire: SignatureWire = { l: signature.level }

  if (signature.ed25519) {
    wire.e = toBase64(signature.ed25519)
  }
  if (signature.mlDsa) {
    wire.p = toBase64(signature.mlDsa)
  }

  return wire
}

/**
 * Decode a UnifiedSignature from JSON wire format.
 */
export function decodeSignature(wire: SignatureWire): UnifiedSignature {
  const signature: UnifiedSignature = { level: wire.l }

  if (wire.e) {
    signature.ed25519 = fromBase64(wire.e)
  }
  if (wire.p) {
    signature.mlDsa = fromBase64(wire.p)
  }

  return signature
}

// ─── Binary Wire Format ──────────────────────────────────────────

/**
 * Encode a UnifiedSignature to compact binary format.
 *
 * Format depends on level:
 * - Level 0: [level:1][ed25519:64] = 65 bytes
 * - Level 1: [level:1][ed25519:64][mlDsa:~3293] = ~3358 bytes
 * - Level 2: [level:1][mlDsa:~3293] = ~3294 bytes
 */
export function encodeSignatureBinary(signature: UnifiedSignature): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([signature.level])]

  if (signature.ed25519) {
    parts.push(signature.ed25519)
  }
  if (signature.mlDsa) {
    parts.push(signature.mlDsa)
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)

  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

/**
 * Decode a UnifiedSignature from compact binary format.
 */
export function decodeSignatureBinary(data: Uint8Array): UnifiedSignature {
  if (data.length < 1) {
    throw new Error('Signature data too short')
  }

  const level = data[0] as SecurityLevel
  const signature: UnifiedSignature = { level }

  let offset = 1

  switch (level) {
    case 0:
      if (data.length < 1 + ED25519_SIGNATURE_SIZE) {
        throw new Error('Level 0 signature too short')
      }
      signature.ed25519 = data.slice(offset, offset + ED25519_SIGNATURE_SIZE)
      break

    case 1:
      if (data.length < 1 + ED25519_SIGNATURE_SIZE) {
        throw new Error('Level 1 signature too short')
      }
      signature.ed25519 = data.slice(offset, offset + ED25519_SIGNATURE_SIZE)
      offset += ED25519_SIGNATURE_SIZE
      signature.mlDsa = data.slice(offset)
      break

    case 2:
      signature.mlDsa = data.slice(offset)
      break

    default:
      throw new Error(`Invalid security level: ${level}`)
  }

  return signature
}

// ─── Signature Size Estimation ───────────────────────────────────

/**
 * Estimate the encoded size of a signature at a given level.
 */
export function estimateSignatureSize(level: SecurityLevel): number {
  switch (level) {
    case 0:
      return 65 // 1 + 64
    case 1:
      return 3374 // 1 + 64 + 3309
    case 2:
      return 3310 // 1 + 3309
    default:
      throw new Error(`Invalid security level: ${level}`)
  }
}
