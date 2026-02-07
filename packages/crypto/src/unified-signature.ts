/**
 * Unified signature types for multi-level cryptography.
 *
 * A UnifiedSignature can contain Ed25519 and/or ML-DSA signatures
 * depending on the security level used:
 * - Level 0: Only ed25519 (64 bytes)
 * - Level 1: Both ed25519 and mlDsa (~3.4KB total)
 * - Level 2: Only mlDsa (~3.3KB)
 */

import type { SecurityLevel } from './security-level'
import {
  ED25519_SIGNATURE_SIZE,
  ML_DSA_65_SIGNATURE_SIZE,
  ML_DSA_65_SIGNATURE_SIZE_MIN,
  ML_DSA_65_SIGNATURE_SIZE_MAX
} from './constants'

// ─── Unified Signature Type ──────────────────────────────────────

/**
 * A signature that can contain Ed25519 and/or ML-DSA signatures
 * depending on the security level used.
 */
export interface UnifiedSignature {
  /**
   * Security level this signature was created at.
   * - 0: Only ed25519 is present
   * - 1: Both ed25519 and mlDsa are present
   * - 2: Only mlDsa is present
   */
  level: SecurityLevel

  /**
   * Ed25519 signature (64 bytes).
   * Present at Level 0 and Level 1.
   */
  ed25519?: Uint8Array

  /**
   * ML-DSA-65 signature (~3,293 bytes).
   * Present at Level 1 and Level 2.
   */
  mlDsa?: Uint8Array
}

// ─── Signature Options ───────────────────────────────────────────

/**
 * Options for signing operations.
 */
export interface SignatureOptions {
  /**
   * Security level to sign at.
   * Defaults to DEFAULT_SECURITY_LEVEL.
   */
  level?: SecurityLevel
}

/**
 * Result of a verification operation.
 */
export interface VerificationResult {
  /** Overall validity based on level and policy */
  valid: boolean

  /** Security level of the signature */
  level: SecurityLevel

  /** Detailed results for each algorithm */
  details: {
    ed25519?: {
      verified: boolean
      error?: string
    }
    mlDsa?: {
      verified: boolean
      error?: string
    }
  }
}

/**
 * Options for verification operations.
 */
export interface VerificationOptions {
  /**
   * Minimum acceptable security level.
   * Signatures below this level will fail verification.
   * Default: 0 (accept any level)
   */
  minLevel?: SecurityLevel

  /**
   * Verification policy.
   * - 'strict': All present signatures must verify (default)
   * - 'permissive': At least one signature must verify
   */
  policy?: 'strict' | 'permissive'
}

// ─── Signature Validation ────────────────────────────────────────

/**
 * Validate that a UnifiedSignature has the correct components for its level.
 */
export function validateSignature(signature: UnifiedSignature): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  switch (signature.level) {
    case 0:
      if (!signature.ed25519) {
        errors.push('Level 0 signature must have ed25519 component')
      }
      if (signature.ed25519 && signature.ed25519.length !== ED25519_SIGNATURE_SIZE) {
        errors.push(
          `Ed25519 signature must be ${ED25519_SIGNATURE_SIZE} bytes, got ${signature.ed25519.length}`
        )
      }
      if (signature.mlDsa) {
        errors.push('Level 0 signature should not have mlDsa component')
      }
      break

    case 1:
      if (!signature.ed25519) {
        errors.push('Level 1 signature must have ed25519 component')
      }
      if (signature.ed25519 && signature.ed25519.length !== ED25519_SIGNATURE_SIZE) {
        errors.push(
          `Ed25519 signature must be ${ED25519_SIGNATURE_SIZE} bytes, got ${signature.ed25519.length}`
        )
      }
      if (!signature.mlDsa) {
        errors.push('Level 1 signature must have mlDsa component')
      }
      if (
        signature.mlDsa &&
        (signature.mlDsa.length < ML_DSA_65_SIGNATURE_SIZE_MIN ||
          signature.mlDsa.length > ML_DSA_65_SIGNATURE_SIZE_MAX)
      ) {
        errors.push(
          `ML-DSA signature should be ~${ML_DSA_65_SIGNATURE_SIZE} bytes, got ${signature.mlDsa.length}`
        )
      }
      break

    case 2:
      if (signature.ed25519) {
        errors.push('Level 2 signature should not have ed25519 component')
      }
      if (!signature.mlDsa) {
        errors.push('Level 2 signature must have mlDsa component')
      }
      if (
        signature.mlDsa &&
        (signature.mlDsa.length < ML_DSA_65_SIGNATURE_SIZE_MIN ||
          signature.mlDsa.length > ML_DSA_65_SIGNATURE_SIZE_MAX)
      ) {
        errors.push(
          `ML-DSA signature should be ~${ML_DSA_65_SIGNATURE_SIZE} bytes, got ${signature.mlDsa.length}`
        )
      }
      break

    default:
      errors.push(`Invalid security level: ${signature.level}`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Calculate the byte size of a UnifiedSignature.
 */
export function signatureSize(signature: UnifiedSignature): number {
  let size = 1 // level byte
  if (signature.ed25519) size += signature.ed25519.length
  if (signature.mlDsa) size += signature.mlDsa.length
  return size
}

// ─── Type Guard ──────────────────────────────────────────────────

/**
 * Type guard for UnifiedSignature.
 */
export function isUnifiedSignature(value: unknown): value is UnifiedSignature {
  if (typeof value !== 'object' || value === null) return false

  const obj = value as Record<string, unknown>

  // Check level is valid
  if (obj.level !== 0 && obj.level !== 1 && obj.level !== 2) return false

  // Check ed25519 if present
  if (obj.ed25519 !== undefined) {
    if (!(obj.ed25519 instanceof Uint8Array)) return false
    if (obj.ed25519.length !== ED25519_SIGNATURE_SIZE) return false
  }

  // Check mlDsa if present
  if (obj.mlDsa !== undefined) {
    if (!(obj.mlDsa instanceof Uint8Array)) return false
    // ML-DSA-65 signatures are ~3293 bytes
    if (
      obj.mlDsa.length < ML_DSA_65_SIGNATURE_SIZE_MIN ||
      obj.mlDsa.length > ML_DSA_65_SIGNATURE_SIZE_MAX
    ) {
      return false
    }
  }

  // Validate presence based on level
  switch (obj.level) {
    case 0:
      return obj.ed25519 !== undefined && obj.mlDsa === undefined
    case 1:
      return obj.ed25519 !== undefined && obj.mlDsa !== undefined
    case 2:
      return obj.ed25519 === undefined && obj.mlDsa !== undefined
    default:
      return false
  }
}
