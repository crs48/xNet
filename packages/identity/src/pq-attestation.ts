/**
 * Post-quantum key attestations.
 *
 * A PQKeyAttestation binds a post-quantum public key to an Ed25519-based DID.
 * The attestation is signed by both the Ed25519 key (proves DID ownership)
 * and the ML-DSA key (proves PQ key possession).
 */

import { ed25519 } from '@noble/curves/ed25519.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { hash, bytesToBase64, base64ToBytes } from '@xnet/crypto'
import { parseDID } from './did'

// ─── Types ───────────────────────────────────────────────────────

/**
 * Algorithm identifier for post-quantum signing.
 * Currently only ML-DSA-65 is supported.
 */
export type PQAlgorithm = 'ml-dsa-65'

/**
 * A self-signed attestation that binds a post-quantum public key to a DID.
 *
 * The attestation is signed by both:
 * - The Ed25519 key (proves DID ownership)
 * - The ML-DSA key (proves PQ key possession)
 *
 * This creates a cryptographic binding between the DID and PQ key.
 */
export interface PQKeyAttestation {
  /** The Ed25519-based DID (did:key:z6Mk...) */
  did: string

  /** ML-DSA-65 public key (1,952 bytes) */
  pqPublicKey: Uint8Array

  /** Post-quantum algorithm identifier */
  algorithm: PQAlgorithm

  /** When this attestation was created (Unix timestamp ms) */
  timestamp: number

  /** Optional expiration (Unix timestamp ms) */
  expiresAt?: number

  /** Ed25519 signature over the attestation payload (proves DID ownership) */
  ed25519Signature: Uint8Array

  /** ML-DSA signature over the attestation payload (proves PQ key possession) */
  pqSignature: Uint8Array
}

/**
 * Wire format for PQKeyAttestation (JSON-serializable).
 */
export interface PQKeyAttestationWire {
  did: string
  pqPublicKey: string // base64
  algorithm: PQAlgorithm
  timestamp: number
  expiresAt?: number
  ed25519Signature: string // base64
  pqSignature: string // base64
}

/**
 * Payload that gets signed in an attestation.
 */
interface AttestationPayload {
  did: string
  pqPublicKey: Uint8Array
  algorithm: PQAlgorithm
  timestamp: number
  expiresAt?: number
}

/**
 * Result of attestation verification.
 */
export interface AttestationVerificationResult {
  valid: boolean
  errors: string[]
  expired: boolean
}

// ─── Canonical Encoding ──────────────────────────────────────────

/**
 * Canonical encoding for attestation payload.
 * Uses a stable byte representation for signing.
 */
function canonicalEncode(payload: AttestationPayload): Uint8Array {
  // Sort keys and encode as JSON for consistent representation
  const json = JSON.stringify({
    algorithm: payload.algorithm,
    did: payload.did,
    expiresAt: payload.expiresAt,
    pqPublicKey: bytesToBase64(payload.pqPublicKey),
    timestamp: payload.timestamp
  })
  return new TextEncoder().encode(json)
}

// ─── Attestation Creation ────────────────────────────────────────

/**
 * Create a new PQ key attestation.
 *
 * @param did - The Ed25519-based DID
 * @param ed25519PrivateKey - Ed25519 private key (32 bytes)
 * @param pqPublicKey - ML-DSA-65 public key (1,952 bytes)
 * @param pqPrivateKey - ML-DSA-65 private key (4,032 bytes)
 * @param options - Additional options
 *
 * @example
 * ```typescript
 * const attestation = createPQKeyAttestation(
 *   'did:key:z6Mk...',
 *   keyBundle.signingKey,
 *   keyBundle.pqPublicKey,
 *   keyBundle.pqSigningKey,
 *   { expiresInDays: 365 }
 * )
 * ```
 */
export function createPQKeyAttestation(
  did: string,
  ed25519PrivateKey: Uint8Array,
  pqPublicKey: Uint8Array,
  pqPrivateKey: Uint8Array,
  options: {
    expiresInDays?: number
    timestamp?: number
  } = {}
): PQKeyAttestation {
  const timestamp = options.timestamp ?? Date.now()
  const expiresAt = options.expiresInDays
    ? timestamp + options.expiresInDays * 24 * 60 * 60 * 1000
    : undefined

  const payload: AttestationPayload = {
    did,
    pqPublicKey,
    algorithm: 'ml-dsa-65',
    timestamp,
    expiresAt
  }

  const payloadBytes = canonicalEncode(payload)
  const payloadHash = hash(payloadBytes, 'blake3')

  // Sign with Ed25519 (proves DID ownership)
  const ed25519Signature = ed25519.sign(payloadHash, ed25519PrivateKey)

  // Sign with ML-DSA (proves PQ key possession)
  const pqSignature = ml_dsa65.sign(payloadHash, pqPrivateKey)

  return {
    did,
    pqPublicKey,
    algorithm: 'ml-dsa-65',
    timestamp,
    expiresAt,
    ed25519Signature,
    pqSignature
  }
}

// ─── Attestation Verification ────────────────────────────────────

/**
 * Verify a PQ key attestation.
 *
 * Checks:
 * 1. Ed25519 signature (proves DID ownership)
 * 2. ML-DSA signature (proves PQ key possession)
 * 3. Expiration (if set)
 *
 * @param attestation - The attestation to verify
 * @returns Verification result with validity and any errors
 */
export function verifyPQKeyAttestation(
  attestation: PQKeyAttestation
): AttestationVerificationResult {
  const errors: string[] = []
  let expired = false

  // Check expiration
  if (attestation.expiresAt && Date.now() > attestation.expiresAt) {
    errors.push('Attestation has expired')
    expired = true
  }

  // Reconstruct payload hash
  const payload: AttestationPayload = {
    did: attestation.did,
    pqPublicKey: attestation.pqPublicKey,
    algorithm: attestation.algorithm,
    timestamp: attestation.timestamp,
    expiresAt: attestation.expiresAt
  }
  const payloadBytes = canonicalEncode(payload)
  const payloadHash = hash(payloadBytes, 'blake3')

  // Verify Ed25519 signature
  try {
    const ed25519PublicKey = parseDID(attestation.did)
    const ed25519Valid = ed25519.verify(attestation.ed25519Signature, payloadHash, ed25519PublicKey)
    if (!ed25519Valid) {
      errors.push('Ed25519 signature is invalid')
    }
  } catch (err) {
    errors.push(
      `Failed to verify Ed25519 signature: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }

  // Verify ML-DSA signature
  try {
    const pqValid = ml_dsa65.verify(attestation.pqSignature, payloadHash, attestation.pqPublicKey)
    if (!pqValid) {
      errors.push('ML-DSA signature is invalid')
    }
  } catch (err) {
    errors.push(
      `Failed to verify ML-DSA signature: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    expired
  }
}

// ─── Serialization ───────────────────────────────────────────────

/**
 * Serialize attestation to wire format.
 */
export function serializeAttestation(attestation: PQKeyAttestation): PQKeyAttestationWire {
  return {
    did: attestation.did,
    pqPublicKey: bytesToBase64(attestation.pqPublicKey),
    algorithm: attestation.algorithm,
    timestamp: attestation.timestamp,
    expiresAt: attestation.expiresAt,
    ed25519Signature: bytesToBase64(attestation.ed25519Signature),
    pqSignature: bytesToBase64(attestation.pqSignature)
  }
}

/**
 * Deserialize attestation from wire format.
 */
export function deserializeAttestation(wire: PQKeyAttestationWire): PQKeyAttestation {
  return {
    did: wire.did,
    pqPublicKey: base64ToBytes(wire.pqPublicKey),
    algorithm: wire.algorithm,
    timestamp: wire.timestamp,
    expiresAt: wire.expiresAt,
    ed25519Signature: base64ToBytes(wire.ed25519Signature),
    pqSignature: base64ToBytes(wire.pqSignature)
  }
}
