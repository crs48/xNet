/**
 * Hybrid key generation for multi-level cryptography.
 *
 * Generates keypairs containing both classical (Ed25519/X25519) and
 * post-quantum (ML-DSA/ML-KEM) keys. Keys can be generated randomly
 * or derived deterministically from a master seed.
 */

import type { HybridSigningKey, HybridPublicKey } from './hybrid-signing'
import type { SecurityLevel } from './security-level'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { hkdf } from './hashing'
import { bytesToBase64, base64ToBytes, constantTimeEqual } from './utils'

// ─── Types ───────────────────────────────────────────────────────

/**
 * Complete hybrid key pair containing classical and post-quantum keys.
 */
export interface HybridKeyPair {
  /** Ed25519 signing keys */
  ed25519: {
    publicKey: Uint8Array // 32 bytes
    privateKey: Uint8Array // 32 bytes
  }

  /** X25519 key exchange keys */
  x25519: {
    publicKey: Uint8Array // 32 bytes
    privateKey: Uint8Array // 32 bytes
  }

  /** ML-DSA-65 signing keys (optional, for PQ support) */
  mlDsa?: {
    publicKey: Uint8Array // 1,952 bytes
    privateKey: Uint8Array // 4,032 bytes
  }

  /** ML-KEM-768 key encapsulation keys (optional, for PQ support) */
  mlKem?: {
    publicKey: Uint8Array // 1,184 bytes
    privateKey: Uint8Array // 2,400 bytes
  }
}

/**
 * Options for key generation.
 */
export interface KeyGenOptions {
  /**
   * Whether to include post-quantum keys.
   * Default: true (always generate PQ keys since we're prerelease)
   */
  includePQ?: boolean

  /**
   * Whether to include key exchange keys (X25519/ML-KEM).
   * Default: true
   */
  includeKeyExchange?: boolean
}

/**
 * Options for deterministic key derivation.
 */
export interface KeyDerivationOptions extends KeyGenOptions {
  /**
   * Version string for key derivation.
   * Changing this will produce different keys from the same seed.
   * Default: 'v1'
   */
  version?: string
}

// ─── Domain Separation Strings ───────────────────────────────────

const DOMAIN_ED25519 = 'xnet-ed25519'
const DOMAIN_X25519 = 'xnet-x25519'
const DOMAIN_ML_DSA = 'xnet-ml-dsa-65'
const DOMAIN_ML_KEM = 'xnet-ml-kem-768'

// ─── Random Key Generation ───────────────────────────────────────

/**
 * Generate a random hybrid key pair.
 *
 * By default, includes post-quantum keys (ML-DSA and ML-KEM).
 * This is the preferred method for xNet since we're prerelease
 * and want quantum security by default.
 *
 * @example
 * ```typescript
 * // Full hybrid keys (default)
 * const keys = generateHybridKeyPair()
 *
 * // Ed25519/X25519 only (opt-out of PQ)
 * const classicalKeys = generateHybridKeyPair({ includePQ: false })
 *
 * // Signing keys only (no key exchange)
 * const signingKeys = generateHybridKeyPair({ includeKeyExchange: false })
 * ```
 */
export function generateHybridKeyPair(options: KeyGenOptions = {}): HybridKeyPair {
  const { includePQ = true, includeKeyExchange = true } = options

  // Ed25519 - always generated
  const ed25519PrivateKey = ed25519.utils.randomSecretKey()
  const ed25519PublicKey = ed25519.getPublicKey(ed25519PrivateKey)

  const keyPair: HybridKeyPair = {
    ed25519: {
      privateKey: ed25519PrivateKey,
      publicKey: ed25519PublicKey
    },
    x25519: { privateKey: new Uint8Array(0), publicKey: new Uint8Array(0) }
  }

  // X25519 - for key exchange
  if (includeKeyExchange) {
    const x25519PrivateKey = x25519.utils.randomSecretKey()
    const x25519PublicKey = x25519.getPublicKey(x25519PrivateKey)
    keyPair.x25519 = {
      privateKey: x25519PrivateKey,
      publicKey: x25519PublicKey
    }
  }

  // Post-quantum keys
  if (includePQ) {
    // ML-DSA-65 for signing
    const mlDsaKeys = ml_dsa65.keygen()
    keyPair.mlDsa = {
      publicKey: mlDsaKeys.publicKey,
      privateKey: mlDsaKeys.secretKey
    }

    // ML-KEM-768 for key exchange
    if (includeKeyExchange) {
      const mlKemKeys = ml_kem768.keygen()
      keyPair.mlKem = {
        publicKey: mlKemKeys.publicKey,
        privateKey: mlKemKeys.secretKey
      }
    }
  }

  return keyPair
}

// ─── Deterministic Key Derivation ────────────────────────────────

/**
 * Derive a hybrid key pair deterministically from a master seed.
 *
 * This produces the same keys given the same seed, which is essential
 * for passkey-based key derivation where we need to recreate keys
 * from a PRF output.
 *
 * @param seed - 32-byte master seed (e.g., from passkey PRF)
 * @param options - Derivation options
 * @returns Deterministic HybridKeyPair
 *
 * @example
 * ```typescript
 * const seed = crypto.getRandomValues(new Uint8Array(32))
 *
 * // Full derivation (default)
 * const keys1 = deriveHybridKeyPair(seed)
 * const keys2 = deriveHybridKeyPair(seed)
 * // keys1 and keys2 are identical
 *
 * // Version change produces different keys
 * const keys3 = deriveHybridKeyPair(seed, { version: 'v2' })
 * // keys3 is different from keys1/keys2
 * ```
 */
export function deriveHybridKeyPair(
  seed: Uint8Array,
  options: KeyDerivationOptions = {}
): HybridKeyPair {
  const { includePQ = true, includeKeyExchange = true, version = 'v1' } = options

  if (seed.length !== 32) {
    throw new Error(`Seed must be 32 bytes, got ${seed.length}`)
  }

  // Derive Ed25519 key
  const ed25519Seed = hkdf(seed, `${DOMAIN_ED25519}-${version}`, 32)
  const ed25519PublicKey = ed25519.getPublicKey(ed25519Seed)

  const keyPair: HybridKeyPair = {
    ed25519: {
      privateKey: ed25519Seed,
      publicKey: ed25519PublicKey
    },
    x25519: { privateKey: new Uint8Array(0), publicKey: new Uint8Array(0) }
  }

  // Derive X25519 key
  if (includeKeyExchange) {
    const x25519Seed = hkdf(seed, `${DOMAIN_X25519}-${version}`, 32)
    const x25519PublicKey = x25519.getPublicKey(x25519Seed)
    keyPair.x25519 = {
      privateKey: x25519Seed,
      publicKey: x25519PublicKey
    }
  }

  // Derive post-quantum keys
  if (includePQ) {
    // ML-DSA uses a 32-byte seed for deterministic key generation
    const mlDsaSeed = hkdf(seed, `${DOMAIN_ML_DSA}-${version}`, 32)
    const mlDsaKeys = ml_dsa65.keygen(mlDsaSeed)
    keyPair.mlDsa = {
      publicKey: mlDsaKeys.publicKey,
      privateKey: mlDsaKeys.secretKey
    }

    // ML-KEM uses a 64-byte seed for deterministic key generation
    if (includeKeyExchange) {
      const mlKemSeed = hkdf(seed, `${DOMAIN_ML_KEM}-${version}`, 64)
      const mlKemKeys = ml_kem768.keygen(mlKemSeed)
      keyPair.mlKem = {
        publicKey: mlKemKeys.publicKey,
        privateKey: mlKemKeys.secretKey
      }
    }
  }

  return keyPair
}

// ─── Key Extraction Utilities ────────────────────────────────────

/**
 * Extract signing keys from a HybridKeyPair for use with hybridSign().
 */
export function extractSigningKeys(keyPair: HybridKeyPair): HybridSigningKey {
  return {
    ed25519: keyPair.ed25519.privateKey,
    mlDsa: keyPair.mlDsa?.privateKey
  }
}

/**
 * Extract public keys from a HybridKeyPair for use with hybridVerify().
 */
export function extractPublicKeys(keyPair: HybridKeyPair): HybridPublicKey {
  return {
    ed25519: keyPair.ed25519.publicKey,
    mlDsa: keyPair.mlDsa?.publicKey
  }
}

// ─── Security Level Utilities ────────────────────────────────────

/**
 * Get the maximum security level this key pair supports.
 */
export function keyPairSecurityLevel(keyPair: HybridKeyPair): SecurityLevel {
  if (keyPair.mlDsa) return 2
  return 0
}

/**
 * Check if a key pair can sign at a given security level.
 */
export function keyPairCanSignAt(keyPair: HybridKeyPair, level: SecurityLevel): boolean {
  switch (level) {
    case 0:
      return true // Always have Ed25519
    case 1:
    case 2:
      return keyPair.mlDsa !== undefined
    default:
      return false
  }
}

// ─── Size Calculation ────────────────────────────────────────────

/**
 * Calculate the total size of a key pair in bytes.
 */
export function keyPairSize(keyPair: HybridKeyPair): {
  privateKeys: number
  publicKeys: number
  total: number
} {
  let privateKeys = 32 // Ed25519
  let publicKeys = 32 // Ed25519

  if (keyPair.x25519.privateKey.length > 0) {
    privateKeys += 32 // X25519
    publicKeys += 32 // X25519
  }

  if (keyPair.mlDsa) {
    privateKeys += 4032 // ML-DSA-65
    publicKeys += 1952 // ML-DSA-65
  }

  if (keyPair.mlKem) {
    privateKeys += 2400 // ML-KEM-768
    publicKeys += 1184 // ML-KEM-768
  }

  return {
    privateKeys,
    publicKeys,
    total: privateKeys + publicKeys
  }
}

// ─── Serialization ───────────────────────────────────────────────

/**
 * Serialized public keys format for storage or transmission.
 */
export interface SerializedPublicKeys {
  ed25519: string // base64
  x25519?: string // base64
  mlDsa?: string // base64
  mlKem?: string // base64
}

/**
 * Serialize public keys to JSON-compatible format.
 */
export function serializePublicKeys(keyPair: HybridKeyPair): SerializedPublicKeys {
  const result: SerializedPublicKeys = {
    ed25519: bytesToBase64(keyPair.ed25519.publicKey)
  }

  if (keyPair.x25519.publicKey.length > 0) {
    result.x25519 = bytesToBase64(keyPair.x25519.publicKey)
  }

  if (keyPair.mlDsa) {
    result.mlDsa = bytesToBase64(keyPair.mlDsa.publicKey)
  }

  if (keyPair.mlKem) {
    result.mlKem = bytesToBase64(keyPair.mlKem.publicKey)
  }

  return result
}

/**
 * Deserialize public keys from JSON-compatible format.
 */
export function deserializePublicKeys(serialized: SerializedPublicKeys): {
  ed25519: Uint8Array
  x25519?: Uint8Array
  mlDsa?: Uint8Array
  mlKem?: Uint8Array
} {
  return {
    ed25519: base64ToBytes(serialized.ed25519),
    x25519: serialized.x25519 ? base64ToBytes(serialized.x25519) : undefined,
    mlDsa: serialized.mlDsa ? base64ToBytes(serialized.mlDsa) : undefined,
    mlKem: serialized.mlKem ? base64ToBytes(serialized.mlKem) : undefined
  }
}

// ─── Key Comparison ──────────────────────────────────────────────

/**
 * Compare two key pairs for public key equality (constant-time for Ed25519).
 */
export function publicKeysEqual(a: HybridKeyPair, b: HybridKeyPair): boolean {
  // Ed25519 comparison (constant-time)
  if (!constantTimeEqual(a.ed25519.publicKey, b.ed25519.publicKey)) {
    return false
  }

  // ML-DSA comparison (if both have it)
  if (a.mlDsa && b.mlDsa) {
    if (!constantTimeEqual(a.mlDsa.publicKey, b.mlDsa.publicKey)) {
      return false
    }
  } else if (a.mlDsa || b.mlDsa) {
    return false // One has PQ, other doesn't
  }

  return true
}
