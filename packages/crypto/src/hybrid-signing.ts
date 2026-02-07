/**
 * Hybrid signing and verification with Ed25519 and ML-DSA.
 *
 * Provides multi-level signing:
 * - Level 0: Ed25519 only (fast, classical security)
 * - Level 1: Ed25519 + ML-DSA-65 (hybrid, both classical and quantum security)
 * - Level 2: ML-DSA-65 only (quantum security, no classical fallback)
 */

import type { SecurityLevel } from './security-level'
import type { UnifiedSignature, VerificationResult, VerificationOptions } from './unified-signature'
import { ed25519 } from '@noble/curves/ed25519.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { getVerificationCache } from './cache/verification-cache'
import { hash } from './hashing'
import { DEFAULT_SECURITY_LEVEL } from './security-level'
import { concatBytes } from './utils'

// ─── Key Types ───────────────────────────────────────────────────

/**
 * Keys required for hybrid signing.
 * Ed25519 is always required (for Level 0/1).
 * ML-DSA is required for Level 1/2.
 */
export interface HybridSigningKey {
  /** Ed25519 private key (32 bytes) */
  ed25519: Uint8Array

  /** ML-DSA-65 private key (4,032 bytes) - required for Level 1/2 */
  mlDsa?: Uint8Array
}

/**
 * Public keys for hybrid verification.
 * Ed25519 is always required (for Level 0/1).
 * ML-DSA is required for Level 1/2.
 */
export interface HybridPublicKey {
  /** Ed25519 public key (32 bytes) */
  ed25519: Uint8Array

  /** ML-DSA-65 public key (1,952 bytes) - required for Level 1/2 */
  mlDsa?: Uint8Array
}

// ─── Signing ─────────────────────────────────────────────────────

/**
 * Sign a message at the specified security level.
 *
 * @param message - The message to sign
 * @param keys - Signing keys (Ed25519 required, ML-DSA for Level 1/2)
 * @param level - Security level (default: DEFAULT_SECURITY_LEVEL)
 * @returns UnifiedSignature containing appropriate signature(s)
 *
 * @example
 * ```typescript
 * // Level 0 - Ed25519 only
 * const sig0 = hybridSign(message, { ed25519: privateKey }, 0)
 *
 * // Level 1 - Both (default when Level 1 is enabled)
 * const sig1 = hybridSign(message, { ed25519: privateKey, mlDsa: pqPrivateKey }, 1)
 *
 * // Level 2 - ML-DSA only
 * const sig2 = hybridSign(message, { ed25519: privateKey, mlDsa: pqPrivateKey }, 2)
 * ```
 */
export function hybridSign(
  message: Uint8Array,
  keys: HybridSigningKey,
  level: SecurityLevel = DEFAULT_SECURITY_LEVEL
): UnifiedSignature {
  const signature: UnifiedSignature = { level }

  switch (level) {
    case 0:
      // Ed25519 only
      signature.ed25519 = ed25519.sign(message, keys.ed25519)
      break

    case 1:
      // Both signatures required
      if (!keys.mlDsa) {
        throw new Error('Level 1 signing requires ML-DSA key')
      }
      signature.ed25519 = ed25519.sign(message, keys.ed25519)
      signature.mlDsa = ml_dsa65.sign(message, keys.mlDsa)
      break

    case 2:
      // ML-DSA only
      if (!keys.mlDsa) {
        throw new Error('Level 2 signing requires ML-DSA key')
      }
      signature.mlDsa = ml_dsa65.sign(message, keys.mlDsa)
      break

    default:
      throw new Error(`Invalid security level: ${level}`)
  }

  return signature
}

// ─── Verification ────────────────────────────────────────────────

/**
 * Verify a hybrid signature.
 *
 * @param message - The original message
 * @param signature - The UnifiedSignature to verify
 * @param publicKeys - Public keys for verification
 * @param options - Verification options
 * @returns VerificationResult with validity and details
 *
 * @example
 * ```typescript
 * const result = hybridVerify(message, signature, {
 *   ed25519: publicKey,
 *   mlDsa: pqPublicKey
 * })
 *
 * if (result.valid) {
 *   console.log(`Verified at Level ${result.level}`)
 * } else {
 *   console.log('Verification failed:', result.details)
 * }
 * ```
 */
export function hybridVerify(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: VerificationOptions = {}
): VerificationResult {
  const { minLevel = 0, policy = 'strict' } = options

  // Check minimum level requirement
  if (signature.level < minLevel) {
    return {
      valid: false,
      level: signature.level,
      details: {
        ed25519: {
          verified: false,
          error: `Signature level ${signature.level} below minimum ${minLevel}`
        }
      }
    }
  }

  const details: VerificationResult['details'] = {}

  // Verify Ed25519 if present in signature
  if (signature.ed25519) {
    try {
      const valid = ed25519.verify(signature.ed25519, message, publicKeys.ed25519)
      details.ed25519 = { verified: valid }
      if (!valid) {
        details.ed25519.error = 'Ed25519 signature invalid'
      }
    } catch (err) {
      details.ed25519 = {
        verified: false,
        error: err instanceof Error ? err.message : 'Ed25519 verification failed'
      }
    }
  }

  // Verify ML-DSA if present in signature
  if (signature.mlDsa) {
    if (!publicKeys.mlDsa) {
      details.mlDsa = {
        verified: false,
        error: 'No ML-DSA public key available for verification'
      }
    } else {
      try {
        const valid = ml_dsa65.verify(signature.mlDsa, message, publicKeys.mlDsa)
        details.mlDsa = { verified: valid }
        if (!valid) {
          details.mlDsa.error = 'ML-DSA signature invalid'
        }
      } catch (err) {
        details.mlDsa = {
          verified: false,
          error: err instanceof Error ? err.message : 'ML-DSA verification failed'
        }
      }
    }
  }

  // Determine overall validity based on level and policy
  const valid = determineValidity(signature.level, details, policy)

  return { valid, level: signature.level, details }
}

/**
 * Determine overall validity based on security level, details, and policy.
 */
function determineValidity(
  level: SecurityLevel,
  details: VerificationResult['details'],
  policy: 'strict' | 'permissive'
): boolean {
  switch (level) {
    case 0:
      // Level 0: Only Ed25519 must verify
      return details.ed25519?.verified ?? false

    case 1:
      if (policy === 'strict') {
        // Strict: Both must verify
        return (details.ed25519?.verified ?? false) && (details.mlDsa?.verified ?? false)
      } else {
        // Permissive: At least one must verify
        return (details.ed25519?.verified ?? false) || (details.mlDsa?.verified ?? false)
      }

    case 2:
      // Level 2: Only ML-DSA must verify
      return details.mlDsa?.verified ?? false

    default:
      return false
  }
}

// ─── Convenience Functions ───────────────────────────────────────

/**
 * Quick check if a signature is valid without full details.
 */
export function hybridVerifyQuick(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: VerificationOptions = {}
): boolean {
  return hybridVerify(message, signature, publicKeys, options).valid
}

/**
 * Get the required key components for a signature level.
 */
export function requiredKeysForLevel(level: SecurityLevel): {
  ed25519: boolean
  mlDsa: boolean
} {
  switch (level) {
    case 0:
      return { ed25519: true, mlDsa: false }
    case 1:
      return { ed25519: true, mlDsa: true }
    case 2:
      return { ed25519: false, mlDsa: true }
    default:
      return { ed25519: false, mlDsa: false }
  }
}

/**
 * Check if keys support a given security level for signing.
 */
export function canSignAtLevel(keys: HybridSigningKey, level: SecurityLevel): boolean {
  const required = requiredKeysForLevel(level)

  if (required.ed25519 && !keys.ed25519) return false
  if (required.mlDsa && !keys.mlDsa) return false

  return true
}

/**
 * Check if keys support a given security level for verification.
 */
export function canVerifyAtLevel(keys: HybridPublicKey, level: SecurityLevel): boolean {
  const required = requiredKeysForLevel(level)

  if (required.ed25519 && !keys.ed25519) return false
  if (required.mlDsa && !keys.mlDsa) return false

  return true
}

/**
 * Get the maximum security level supported by a signing key bundle.
 */
export function maxSecurityLevel(keys: HybridSigningKey): SecurityLevel {
  if (keys.mlDsa) return 2
  return 0
}

// ─── Cached Verification ─────────────────────────────────────────

/**
 * Options for cached verification.
 */
export interface CachedVerificationOptions extends VerificationOptions {
  /** Whether to use the cache (default: true) */
  useCache?: boolean
}

/**
 * Verify a hybrid signature with caching.
 *
 * Uses an LRU cache to avoid redundant cryptographic operations.
 * Cache key is derived from (message hash + signature + public keys).
 *
 * This can provide significant performance improvements when the same
 * signatures are verified multiple times (e.g., during sync or history replay).
 *
 * @param message - The original message
 * @param signature - The UnifiedSignature to verify
 * @param publicKeys - Public keys for verification
 * @param options - Verification options including cache control
 * @returns VerificationResult with validity and details
 *
 * @example
 * ```typescript
 * // First verification - performs cryptographic checks
 * const result1 = hybridVerifyCached(message, signature, publicKeys)
 *
 * // Second verification of same data - returns cached result
 * const result2 = hybridVerifyCached(message, signature, publicKeys)
 *
 * // Disable cache for sensitive operations
 * const result3 = hybridVerifyCached(message, signature, publicKeys, { useCache: false })
 * ```
 */
export function hybridVerifyCached(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: CachedVerificationOptions = {}
): VerificationResult {
  const { useCache = true, ...verifyOptions } = options

  // Skip cache if disabled
  if (!useCache) {
    return hybridVerify(message, signature, publicKeys, verifyOptions)
  }

  const cache = getVerificationCache()

  // Compute hashes for cache key
  const messageHash = hash(message, 'blake3')
  const publicKeyBytes = concatBytes(publicKeys.ed25519, publicKeys.mlDsa ?? new Uint8Array(0))
  const publicKeyHash = hash(publicKeyBytes, 'blake3')

  // Check cache
  const cached = cache.get(messageHash, signature, publicKeyHash)
  if (cached) {
    return cached
  }

  // Perform verification
  const result = hybridVerify(message, signature, publicKeys, verifyOptions)

  // Cache the result
  cache.set(messageHash, signature, publicKeyHash, result)

  return result
}

/**
 * Quick cached check if a signature is valid without full details.
 */
export function hybridVerifyCachedQuick(
  message: Uint8Array,
  signature: UnifiedSignature,
  publicKeys: HybridPublicKey,
  options: CachedVerificationOptions = {}
): boolean {
  return hybridVerifyCached(message, signature, publicKeys, options).valid
}

// ─── Batch Operations ────────────────────────────────────────────

/**
 * Sign multiple messages at the same level (useful for batch operations).
 */
export function hybridSignBatch(
  messages: Uint8Array[],
  keys: HybridSigningKey,
  level: SecurityLevel = DEFAULT_SECURITY_LEVEL
): UnifiedSignature[] {
  return messages.map((msg) => hybridSign(msg, keys, level))
}

/**
 * Item for batch verification.
 */
export interface VerifyBatchItem {
  message: Uint8Array
  signature: UnifiedSignature
  publicKeys: HybridPublicKey
}

/**
 * Verify multiple signatures.
 * Returns results in same order as input items.
 */
export function hybridVerifyBatch(
  items: VerifyBatchItem[],
  options: VerificationOptions = {}
): VerificationResult[] {
  return items.map(({ message, signature, publicKeys }) =>
    hybridVerify(message, signature, publicKeys, options)
  )
}

/**
 * Verify multiple signatures asynchronously (for future worker support).
 */
export async function hybridVerifyBatchAsync(
  items: VerifyBatchItem[],
  options: VerificationOptions = {}
): Promise<VerificationResult[]> {
  // Currently synchronous, but async signature allows future worker optimization
  return Promise.resolve(hybridVerifyBatch(items, options))
}

/**
 * Verify all signatures and return single boolean result.
 */
export function hybridVerifyAll(
  items: VerifyBatchItem[],
  options: VerificationOptions = {}
): boolean {
  const results = hybridVerifyBatch(items, options)
  return results.every((r) => r.valid)
}

/**
 * Verify all signatures asynchronously and return single boolean result.
 */
export async function hybridVerifyAllAsync(
  items: VerifyBatchItem[],
  options: VerificationOptions = {}
): Promise<boolean> {
  const results = await hybridVerifyBatchAsync(items, options)
  return results.every((r) => r.valid)
}
