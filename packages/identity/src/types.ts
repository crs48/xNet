/**
 * Identity types for xNet
 */

import type { SecurityLevel } from '@xnet/crypto'

// ─── DID Type ────────────────────────────────────────────────

/**
 * Ed25519-based DID (did:key:z6Mk...)
 */
export type DID = `did:key:${string}`

// ─── Identity ────────────────────────────────────────────────

/**
 * A decentralized identity
 */
export interface Identity {
  did: DID // did:key:z6Mk...
  publicKey: Uint8Array // Ed25519 public key
  created: number
}

// ─── Key Bundles ─────────────────────────────────────────────

/**
 * A bundle of signing and encryption keys (Ed25519/X25519 only).
 *
 * @deprecated Use HybridKeyBundle instead for new code.
 * This type remains for backward compatibility during migration.
 */
export interface KeyBundle {
  signingKey: Uint8Array // Ed25519 private key
  encryptionKey: Uint8Array // X25519 private key
  identity: Identity
}

/**
 * Complete key bundle with hybrid cryptographic keys.
 *
 * This replaces the old KeyBundle type. New identities always
 * have post-quantum keys by default (since we're prerelease).
 *
 * Key sizes:
 * - signingKey (Ed25519): 32 bytes
 * - encryptionKey (X25519): 32 bytes
 * - pqSigningKey (ML-DSA-65): 4,032 bytes
 * - pqPublicKey (ML-DSA-65): 1,952 bytes
 * - pqEncryptionKey (ML-KEM-768): 2,400 bytes
 * - pqEncryptionPublicKey (ML-KEM-768): 1,184 bytes
 */
export interface HybridKeyBundle {
  // ─── Classical Keys (Always Present) ───────────────────────

  /** Ed25519 private key for signing (32 bytes) */
  signingKey: Uint8Array

  /** X25519 private key for encryption/key exchange (32 bytes) */
  encryptionKey: Uint8Array

  // ─── Post-Quantum Keys (Present by Default) ────────────────

  /** ML-DSA-65 private key for signing (4,032 bytes) */
  pqSigningKey?: Uint8Array

  /** ML-DSA-65 public key (1,952 bytes) - cached for convenience */
  pqPublicKey?: Uint8Array

  /** ML-KEM-768 private key for key exchange (2,400 bytes) */
  pqEncryptionKey?: Uint8Array

  /** ML-KEM-768 public key (1,184 bytes) - cached for convenience */
  pqEncryptionPublicKey?: Uint8Array

  // ─── Identity ──────────────────────────────────────────────

  /** Identity derived from Ed25519 public key */
  identity: Identity

  /** Maximum security level this bundle supports (0, 1, or 2) */
  maxSecurityLevel: SecurityLevel
}

/**
 * Options for creating a new key bundle.
 */
export interface CreateKeyBundleOptions {
  /**
   * Whether to include post-quantum keys.
   * Default: true (we're prerelease, always include PQ)
   */
  includePQ?: boolean

  /**
   * Seed for deterministic derivation.
   * If not provided, random keys are generated.
   */
  seed?: Uint8Array
}

/**
 * An encrypted key stored with passkey protection
 */
export interface StoredKey {
  id: string
  encryptedKey: Uint8Array // Encrypted with passkey
  salt: Uint8Array
  created: number
}

/**
 * A UCAN capability
 */
export interface UCANCapability {
  with: string // Resource URI
  can: string // Action (read, write, etc.)
}

/**
 * A UCAN token payload
 */
export interface UCANToken {
  iss: string // Issuer DID
  aud: string // Audience DID
  exp: number // Expiration timestamp
  att: UCANCapability[] // Capabilities
  prf: string[] // Proof chain (parent UCANs)
  sig: Uint8Array // Signature
}
