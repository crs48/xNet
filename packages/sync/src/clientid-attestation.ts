/**
 * ClientID-to-DID Binding - Cryptographically bind Yjs clientIDs to DIDs
 *
 * Yjs assigns random integer clientIDs that have no cryptographic binding to
 * the author's identity. This module provides signed attestations that bind
 * a clientID to a DID for verifiable author attribution.
 *
 * V2 introduces multi-level signature support (Ed25519 and/or ML-DSA-65).
 */

import type { DID } from '@xnetjs/core'
import {
  hash,
  sign,
  verify,
  hybridSign,
  hybridVerify,
  encodeSignature,
  decodeSignature,
  type UnifiedSignature,
  type SignatureWire,
  type SecurityLevel,
  DEFAULT_SECURITY_LEVEL
} from '@xnetjs/crypto'
import { parseDID, type PQKeyRegistry, type HybridKeyBundle } from '@xnetjs/identity'

// ─── V1 Types (Legacy) ────────────────────────────────────────

/**
 * A signed attestation binding a Yjs clientID to a DID (V1 format).
 * @deprecated Use ClientIdAttestationV2 for new code
 */
export interface ClientIdAttestationV1 {
  /** The Yjs clientID being attested */
  clientId: number

  /** The DID claiming this clientID */
  did: string

  /** Ed25519 signature over BLAKE3(payload) */
  signature: Uint8Array

  /** Session expiry (Unix timestamp seconds) */
  expiresAt: number

  /** Room this attestation applies to */
  room: string
}

// ─── V2 Types (Multi-Level) ───────────────────────────────────

/**
 * A signed attestation binding a Yjs clientID to a DID (V2 format with multi-level signatures).
 */
export interface ClientIdAttestationV2 {
  /** Wire format version */
  v: 2

  /** The Yjs clientID being attested */
  clientId: number

  /** The DID claiming this clientID */
  did: DID

  /** When this binding was created (ms since epoch) */
  timestamp: number

  /** Session expiry (Unix timestamp ms) */
  expiresAt?: number

  /** Room this attestation applies to */
  room: string

  /** Multi-level signature */
  signature: UnifiedSignature
}

/**
 * Wire format for ClientIdAttestationV2.
 */
export interface ClientIdAttestationWire {
  v: 2
  c: number // clientId
  d: string // did
  t: number // timestamp
  e?: number // expiresAt
  r: string // room
  s: SignatureWire
}

/**
 * Union type for all attestation versions.
 */
export type ClientIdAttestation = ClientIdAttestationV1 | ClientIdAttestationV2

// ─── Result Types ─────────────────────────────────────────────

/**
 * Result of attestation verification (V1 format).
 */
export interface AttestationVerifyResult {
  valid: boolean
  reason?: 'expired' | 'invalid_signature' | 'did_resolution_failed'
}

/**
 * Result of attestation verification (V2 format with details).
 */
export interface AttestationVerificationResult {
  valid: boolean
  expired: boolean
  level: SecurityLevel
  errors: string[]
}

/**
 * Options for creating an attestation.
 */
export interface CreateAttestationOptions {
  /** Expiration time in ms (optional) */
  expiresInMs?: number

  /** Security level (default: 0 for Ed25519-only) */
  level?: SecurityLevel
}

/**
 * Options for verifying an attestation.
 */
export interface VerifyAttestationOptions {
  /** PQ key registry for Level 1/2 verification */
  registry?: PQKeyRegistry

  /** Minimum security level required */
  minLevel?: SecurityLevel
}

// ─── Type Guards ─────────────────────────────────────────────

/**
 * Check if an attestation is V2 format.
 */
export function isV2Attestation(
  attestation: ClientIdAttestation
): attestation is ClientIdAttestationV2 {
  return 'v' in attestation && attestation.v === 2
}

/**
 * Check if an attestation is V1 format.
 */
export function isV1Attestation(
  attestation: ClientIdAttestation
): attestation is ClientIdAttestationV1 {
  return !('v' in attestation)
}

// ─── V1 Functions (Legacy) ────────────────────────────────────

/**
 * Create the payload bytes for V1 signing.
 */
function attestationPayloadV1(
  clientId: number,
  did: string,
  room: string,
  expiresAt: number
): Uint8Array {
  const text = `clientid-bind:${clientId}:${did}:${room}:${expiresAt}`
  return new TextEncoder().encode(text)
}

/**
 * Create a signed clientID attestation (V1 format).
 *
 * @deprecated Use createClientIdAttestationV2() for new code
 */
export function createClientIdAttestationV1(
  clientId: number,
  did: string,
  privateKey: Uint8Array,
  room: string,
  ttlSeconds = 3600
): ClientIdAttestationV1 {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = attestationPayloadV1(clientId, did, room, expiresAt)
  const payloadHash = hash(payload, 'blake3')
  const signature = sign(payloadHash, privateKey)

  return { clientId, did, signature, expiresAt, room }
}

/**
 * Verify a V1 clientID attestation.
 *
 * @deprecated Use verifyClientIdAttestationV2() for V2 attestations
 */
export function verifyClientIdAttestationV1(
  attestation: ClientIdAttestationV1
): AttestationVerifyResult {
  // Check expiry
  const now = Math.floor(Date.now() / 1000)
  if (attestation.expiresAt < now) {
    return { valid: false, reason: 'expired' }
  }

  try {
    // Extract public key from DID
    const publicKey = parseDID(attestation.did)

    // Recreate and hash the payload
    const payload = attestationPayloadV1(
      attestation.clientId,
      attestation.did,
      attestation.room,
      attestation.expiresAt
    )
    const payloadHash = hash(payload, 'blake3')

    // Verify signature
    const valid = verify(payloadHash, attestation.signature, publicKey)

    if (!valid) {
      return { valid: false, reason: 'invalid_signature' }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'did_resolution_failed' }
  }
}

// ─── V2 Functions (Multi-Level) ───────────────────────────────

/**
 * Create a signed clientID attestation (V2 format with multi-level signatures).
 *
 * @param clientId - The Yjs clientID to attest
 * @param room - The room this attestation applies to
 * @param keyBundle - Key bundle for signing
 * @param options - Creation options
 * @returns Signed attestation
 *
 * @example
 * ```typescript
 * const attestation = createClientIdAttestationV2(doc.clientID, 'xnet-doc-abc', keyBundle)
 * ws.send({ type: 'clientid-bind', room, attestation: serializeAttestation(attestation) })
 * ```
 */
export function createClientIdAttestationV2(
  clientId: number,
  room: string,
  keyBundle: HybridKeyBundle,
  options: CreateAttestationOptions = {}
): ClientIdAttestationV2 {
  const { expiresInMs, level = DEFAULT_SECURITY_LEVEL } = options

  const timestamp = Date.now()
  const expiresAt = expiresInMs ? timestamp + expiresInMs : undefined

  const payload = {
    v: 2,
    clientId,
    did: keyBundle.identity.did,
    timestamp,
    expiresAt,
    room
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadHash = hash(payloadBytes, 'blake3')

  const signature = hybridSign(
    payloadHash,
    {
      ed25519: keyBundle.signingKey,
      mlDsa: keyBundle.pqSigningKey
    },
    level
  )

  return {
    v: 2,
    clientId,
    did: keyBundle.identity.did,
    timestamp,
    expiresAt,
    room,
    signature
  }
}

/**
 * Verify a V2 clientID attestation with multi-level signature support.
 *
 * @param attestation - The attestation to verify
 * @param options - Verification options
 * @returns Verification result with detailed errors
 */
export async function verifyClientIdAttestationV2(
  attestation: ClientIdAttestationV2,
  options: VerifyAttestationOptions = {}
): Promise<AttestationVerificationResult> {
  const { registry, minLevel = 0 } = options
  const errors: string[] = []

  // Check expiration
  const expired = attestation.expiresAt !== undefined && Date.now() > attestation.expiresAt
  if (expired) {
    errors.push('Attestation has expired')
  }

  // Check minimum security level
  if (attestation.signature.level < minLevel) {
    errors.push(
      `Security level too low: ${attestation.signature.level} < ${minLevel} (required minimum)`
    )
  }

  // Get public keys
  let ed25519PublicKey: Uint8Array
  try {
    ed25519PublicKey = parseDID(attestation.did)
  } catch {
    errors.push('Failed to parse DID')
    return {
      valid: false,
      expired,
      level: attestation.signature.level,
      errors
    }
  }

  let pqPublicKey: Uint8Array | undefined

  if (attestation.signature.level >= 1 && registry) {
    const lookedUp = await registry.lookup(attestation.did)
    pqPublicKey = lookedUp ?? undefined
  }

  // Verify signature
  const payload = {
    v: 2,
    clientId: attestation.clientId,
    did: attestation.did,
    timestamp: attestation.timestamp,
    expiresAt: attestation.expiresAt,
    room: attestation.room
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadHash = hash(payloadBytes, 'blake3')

  const result = hybridVerify(
    payloadHash,
    attestation.signature,
    { ed25519: ed25519PublicKey, mlDsa: pqPublicKey },
    { minLevel }
  )

  if (!result.valid) {
    if (result.details.ed25519?.error) errors.push(result.details.ed25519.error)
    if (result.details.mlDsa?.error) errors.push(result.details.mlDsa.error)
    if (!result.details.ed25519?.error && !result.details.mlDsa?.error) {
      errors.push('Signature verification failed')
    }
  }

  return {
    valid: errors.length === 0,
    expired,
    level: attestation.signature.level,
    errors
  }
}

// ─── Serialization ───────────────────────────────────────────

/**
 * Serialize V2 attestation to wire format.
 */
export function serializeClientIdAttestation(
  attestation: ClientIdAttestationV2
): ClientIdAttestationWire {
  return {
    v: 2,
    c: attestation.clientId,
    d: attestation.did,
    t: attestation.timestamp,
    e: attestation.expiresAt,
    r: attestation.room,
    s: encodeSignature(attestation.signature)
  }
}

/**
 * Deserialize V2 attestation from wire format.
 */
export function deserializeClientIdAttestation(
  wire: ClientIdAttestationWire
): ClientIdAttestationV2 {
  if (wire.v !== 2) {
    throw new Error(`Unsupported attestation version: ${wire.v}. Expected version 2.`)
  }

  return {
    v: 2,
    clientId: wire.c,
    did: wire.d as DID,
    timestamp: wire.t,
    expiresAt: wire.e,
    room: wire.r,
    signature: decodeSignature(wire.s)
  }
}

// ─── Unified API (Auto-Detect Version) ────────────────────────

/**
 * Create a signed clientID attestation.
 *
 * @overload V1 signature (legacy)
 */
export function createClientIdAttestation(
  clientId: number,
  did: string,
  privateKey: Uint8Array,
  room: string,
  ttlSeconds?: number
): ClientIdAttestationV1

/**
 * @overload V2 signature (multi-level)
 */
export function createClientIdAttestation(
  clientId: number,
  room: string,
  keyBundle: HybridKeyBundle,
  options?: CreateAttestationOptions
): ClientIdAttestationV2

export function createClientIdAttestation(
  clientId: number,
  didOrRoom: string,
  privateKeyOrKeyBundle: Uint8Array | HybridKeyBundle,
  roomOrOptions?: string | CreateAttestationOptions,
  ttlSeconds?: number
): ClientIdAttestation {
  // V2 format: (clientId, room, keyBundle, options?)
  if (
    typeof privateKeyOrKeyBundle === 'object' &&
    'identity' in privateKeyOrKeyBundle &&
    'signingKey' in privateKeyOrKeyBundle
  ) {
    return createClientIdAttestationV2(
      clientId,
      didOrRoom, // This is room in V2
      privateKeyOrKeyBundle,
      roomOrOptions as CreateAttestationOptions | undefined
    )
  }

  // V1 format: (clientId, did, privateKey, room, ttlSeconds?)
  return createClientIdAttestationV1(
    clientId,
    didOrRoom, // This is did in V1
    privateKeyOrKeyBundle as Uint8Array,
    roomOrOptions as string,
    ttlSeconds
  )
}

/**
 * Verify a clientID attestation (auto-detects version).
 */
export function verifyClientIdAttestation(
  attestation: ClientIdAttestationV1
): AttestationVerifyResult
export function verifyClientIdAttestation(
  attestation: ClientIdAttestationV2,
  options?: VerifyAttestationOptions
): Promise<AttestationVerificationResult>
export function verifyClientIdAttestation(
  attestation: ClientIdAttestation,
  options?: VerifyAttestationOptions
): AttestationVerifyResult | Promise<AttestationVerificationResult> {
  if (isV2Attestation(attestation)) {
    return verifyClientIdAttestationV2(attestation, options)
  }
  return verifyClientIdAttestationV1(attestation)
}

// ─── ClientID Map ─────────────────────────────────────────────

/**
 * Interface for a per-room clientID map.
 */
export interface ClientIdMap {
  /** Look up DID by clientId */
  getOwner(clientId: number): string | undefined

  /** Look up clientId by DID */
  getClientId(did: string): number | undefined

  /** Register a verified attestation */
  register(attestation: ClientIdAttestation): void

  /** Remove expired bindings */
  cleanup(): void

  /** Get all active bindings */
  getAll(): Array<{ clientId: number; did: string; expiresAt: number }>

  /** Check if a clientID is attested */
  has(clientId: number): boolean

  /** Get the number of active bindings */
  size(): number
}

/**
 * Implementation of ClientIdMap for tracking clientID->DID bindings.
 *
 * @example
 * ```typescript
 * const map = new ClientIdMapImpl()
 *
 * // On receiving attestation:
 * const result = verifyClientIdAttestation(attestation)
 * if (result.valid) {
 *   map.register(attestation)
 * }
 *
 * // On receiving update:
 * const owner = map.getOwner(envelope.clientId)
 * if (owner && owner !== envelope.authorDID) {
 *   // ClientID claimed by different DID - reject!
 * }
 * ```
 */
export class ClientIdMapImpl implements ClientIdMap {
  private byClientId = new Map<number, { did: string; expiresAt: number }>()
  private byDid = new Map<string, { clientId: number; expiresAt: number }>()

  getOwner(clientId: number): string | undefined {
    const entry = this.byClientId.get(clientId)
    if (!entry) return undefined

    // Check if expired
    if (entry.expiresAt < Math.floor(Date.now() / 1000)) {
      this.byClientId.delete(clientId)
      this.byDid.delete(entry.did)
      return undefined
    }

    return entry.did
  }

  getClientId(did: string): number | undefined {
    const entry = this.byDid.get(did)
    if (!entry) return undefined

    // Check if expired
    if (entry.expiresAt < Math.floor(Date.now() / 1000)) {
      this.byDid.delete(did)
      this.byClientId.delete(entry.clientId)
      return undefined
    }

    return entry.clientId
  }

  register(attestation: ClientIdAttestation): void {
    const did = isV2Attestation(attestation) ? attestation.did : attestation.did
    const expiresAt = isV2Attestation(attestation)
      ? attestation.expiresAt
        ? Math.floor(attestation.expiresAt / 1000)
        : Math.floor(Date.now() / 1000) + 3600 // Default 1 hour
      : attestation.expiresAt

    // Remove any previous binding for this DID (re-join with new clientId)
    const prev = this.byDid.get(did)
    if (prev) {
      this.byClientId.delete(prev.clientId)
    }

    // Also remove any existing binding for this clientId
    const prevDid = this.byClientId.get(attestation.clientId)
    if (prevDid) {
      this.byDid.delete(prevDid.did)
    }

    this.byClientId.set(attestation.clientId, { did, expiresAt })
    this.byDid.set(did, { clientId: attestation.clientId, expiresAt })
  }

  cleanup(): void {
    const now = Math.floor(Date.now() / 1000)
    for (const [clientId, entry] of this.byClientId) {
      if (entry.expiresAt < now) {
        this.byClientId.delete(clientId)
        this.byDid.delete(entry.did)
      }
    }
  }

  getAll(): Array<{ clientId: number; did: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000)
    return Array.from(this.byClientId.entries())
      .filter(([_, entry]) => entry.expiresAt > now)
      .map(([clientId, entry]) => ({
        clientId,
        did: entry.did,
        expiresAt: entry.expiresAt
      }))
  }

  has(clientId: number): boolean {
    return this.getOwner(clientId) !== undefined
  }

  size(): number {
    return this.byClientId.size
  }

  /**
   * Get the count of non-expired entries without mutating state.
   * This is useful for accurate counts but slower than size().
   */
  activeCount(): number {
    const now = Date.now()
    let count = 0
    for (const entry of this.byClientId.values()) {
      if (entry.expiresAt > now) {
        count++
      }
    }
    return count
  }

  /**
   * Clear all bindings.
   */
  clear(): void {
    this.byClientId.clear()
    this.byDid.clear()
  }
}

/**
 * Check if an update's clientID matches the expected owner.
 *
 * @param clientId - The clientID from the update
 * @param authorDID - The DID from the envelope
 * @param map - The clientID map
 * @returns true if valid (matches or no binding exists), false if mismatch
 */
export function validateClientIdOwnership(
  clientId: number,
  authorDID: string,
  map: ClientIdMap
): boolean {
  const owner = map.getOwner(clientId)

  // No binding exists - allow (graceful, binding not enforced until attestation)
  if (owner === undefined) {
    return true
  }

  // Binding exists - must match
  return owner === authorDID
}
