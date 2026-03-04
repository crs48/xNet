/**
 * @xnetjs/identity - Hybrid key bundle creation and utilities
 *
 * This module provides functions for creating and working with HybridKeyBundle,
 * which contains both classical (Ed25519/X25519) and post-quantum (ML-DSA/ML-KEM)
 * cryptographic keys.
 */
import type { PQKeyRegistry } from './pq-registry'
import type { HybridKeyBundle, CreateKeyBundleOptions, Identity, DID } from './types'
import {
  generateHybridKeyPair,
  deriveHybridKeyPair,
  hybridSign,
  hybridVerify,
  type SecurityLevel,
  type UnifiedSignature,
  type HybridKeyPair
} from '@xnetjs/crypto'
import { createDID } from './did'
import { createPQKeyAttestation, type PQKeyAttestation } from './pq-attestation'

// ─── Key Bundle Creation ─────────────────────────────────────────

/**
 * Create a new hybrid key bundle.
 *
 * By default, this generates post-quantum keys (ML-DSA and ML-KEM)
 * in addition to classical Ed25519/X25519 keys.
 *
 * @example
 * ```typescript
 * // Random generation (default: includes PQ keys)
 * const bundle = createKeyBundle()
 *
 * // Deterministic from seed (e.g., from passkey PRF)
 * const bundle = createKeyBundle({ seed: prfOutput })
 *
 * // Classical only (opt-out of PQ for specific use case)
 * const bundle = createKeyBundle({ includePQ: false })
 * ```
 */
export function createKeyBundle(options: CreateKeyBundleOptions = {}): HybridKeyBundle {
  const { includePQ = true, seed } = options

  // Generate or derive keys
  const keyPair: HybridKeyPair = seed
    ? deriveHybridKeyPair(seed, { includePQ })
    : generateHybridKeyPair({ includePQ })

  // Create identity from Ed25519 public key
  const did = createDID(keyPair.ed25519.publicKey) as DID
  const identity: Identity = {
    did,
    publicKey: keyPair.ed25519.publicKey,
    created: Date.now()
  }

  const bundle: HybridKeyBundle = {
    signingKey: keyPair.ed25519.privateKey,
    encryptionKey: keyPair.x25519.privateKey,
    identity,
    maxSecurityLevel: keyPair.mlDsa ? 2 : 0
  }

  // Add PQ keys if generated
  if (keyPair.mlDsa) {
    bundle.pqSigningKey = keyPair.mlDsa.privateKey
    bundle.pqPublicKey = keyPair.mlDsa.publicKey
  }

  if (keyPair.mlKem) {
    bundle.pqEncryptionKey = keyPair.mlKem.privateKey
    bundle.pqEncryptionPublicKey = keyPair.mlKem.publicKey
  }

  return bundle
}

/**
 * Create a key bundle and register its PQ attestation.
 *
 * This is the preferred method for creating identities, as it
 * automatically creates the attestation linking the DID to the PQ key.
 *
 * @example
 * ```typescript
 * const registry = createPQKeyRegistry()
 * const { bundle, attestation } = await createKeyBundleWithAttestation(registry)
 *
 * // The registry now has the PQ key associated with the DID
 * const pqKey = await registry.lookup(bundle.identity.did)
 * ```
 */
export async function createKeyBundleWithAttestation(
  registry: PQKeyRegistry,
  options: CreateKeyBundleOptions & { expiresInDays?: number } = {}
): Promise<{ bundle: HybridKeyBundle; attestation: PQKeyAttestation | null }> {
  const bundle = createKeyBundle(options)

  let attestation: PQKeyAttestation | null = null

  // Create and store attestation if PQ keys are present
  if (bundle.pqSigningKey && bundle.pqPublicKey) {
    attestation = createPQKeyAttestation(
      bundle.identity.did,
      bundle.signingKey,
      bundle.pqPublicKey,
      bundle.pqSigningKey,
      { expiresInDays: options.expiresInDays }
    )

    await registry.store(attestation)
  }

  return { bundle, attestation }
}

// ─── Signing / Verification ──────────────────────────────────────

/**
 * Sign a message using the key bundle.
 *
 * @param bundle - The key bundle to sign with
 * @param message - Message to sign
 * @param level - Security level (default: min of bundle's max and 1)
 *
 * @example
 * ```typescript
 * const bundle = createKeyBundle()
 * const message = new TextEncoder().encode('hello')
 *
 * // Sign at default level (Level 1 for hybrid bundles)
 * const sig = signWithBundle(bundle, message)
 *
 * // Sign at specific level
 * const sigL0 = signWithBundle(bundle, message, 0)
 * const sigL2 = signWithBundle(bundle, message, 2)
 * ```
 */
export function signWithBundle(
  bundle: HybridKeyBundle,
  message: Uint8Array,
  level?: SecurityLevel
): UnifiedSignature {
  // Default to Level 1 for hybrid bundles, Level 0 for classical
  const effectiveLevel = level ?? (Math.min(bundle.maxSecurityLevel, 1) as SecurityLevel)

  return hybridSign(
    message,
    {
      ed25519: bundle.signingKey,
      mlDsa: bundle.pqSigningKey
    },
    effectiveLevel
  )
}

/**
 * Verify a signature against a key bundle's public keys.
 *
 * @param bundle - The key bundle to verify against
 * @param message - Original message
 * @param signature - Signature to verify
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * const bundle = createKeyBundle()
 * const message = new TextEncoder().encode('hello')
 * const sig = signWithBundle(bundle, message)
 *
 * const valid = verifyWithBundle(bundle, message, sig)
 * // valid === true
 * ```
 */
export function verifyWithBundle(
  bundle: HybridKeyBundle,
  message: Uint8Array,
  signature: UnifiedSignature
): boolean {
  const result = hybridVerify(message, signature, {
    ed25519: bundle.identity.publicKey,
    mlDsa: bundle.pqPublicKey
  })

  return result.valid
}

// ─── Bundle Utilities ────────────────────────────────────────────

/**
 * Get the maximum security level supported by a bundle.
 *
 * - Level 0: Ed25519 only (always supported)
 * - Level 1: Ed25519 + ML-DSA (requires PQ keys)
 * - Level 2: ML-DSA only (requires PQ keys)
 */
export function bundleSecurityLevel(bundle: HybridKeyBundle): SecurityLevel {
  return bundle.maxSecurityLevel
}

/**
 * Check if bundle can sign at a given level.
 *
 * @param bundle - The key bundle to check
 * @param level - Security level to check
 * @returns true if the bundle has the required keys for the level
 */
export function bundleCanSignAt(bundle: HybridKeyBundle, level: SecurityLevel): boolean {
  switch (level) {
    case 0:
      return true // Ed25519 always present
    case 1:
    case 2:
      return bundle.pqSigningKey !== undefined
    default:
      return false
  }
}

/**
 * Calculate the storage size of a key bundle in bytes.
 *
 * This is useful for estimating storage requirements, especially
 * when deciding whether to include PQ keys.
 *
 * Typical sizes:
 * - Classical only: ~96 bytes
 * - With PQ signing: ~6,080 bytes
 * - With all PQ keys: ~9,680 bytes
 */
export function bundleSize(bundle: HybridKeyBundle): number {
  let size = 0

  // Classical keys (always present)
  size += bundle.signingKey.length // 32
  size += bundle.encryptionKey.length // 32

  // PQ signing keys
  if (bundle.pqSigningKey) size += bundle.pqSigningKey.length // 4032
  if (bundle.pqPublicKey) size += bundle.pqPublicKey.length // 1952

  // PQ encryption keys
  if (bundle.pqEncryptionKey) size += bundle.pqEncryptionKey.length // 2400
  if (bundle.pqEncryptionPublicKey) size += bundle.pqEncryptionPublicKey.length // 1184

  // Identity public key
  size += bundle.identity.publicKey.length // 32

  return size
}

// ─── Conversion Utilities ────────────────────────────────────────

/**
 * Extract just the public keys from a bundle.
 *
 * Safe to share - contains no private key material.
 */
export function extractPublicKeys(bundle: HybridKeyBundle): {
  ed25519: Uint8Array
  mlDsa?: Uint8Array
  mlKem?: Uint8Array
} {
  return {
    ed25519: bundle.identity.publicKey,
    mlDsa: bundle.pqPublicKey,
    mlKem: bundle.pqEncryptionPublicKey
  }
}

/**
 * Check if two bundles represent the same identity.
 *
 * Compares the DID (derived from Ed25519 public key).
 */
export function bundlesMatch(a: HybridKeyBundle, b: HybridKeyBundle): boolean {
  return a.identity.did === b.identity.did
}
