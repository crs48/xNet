/**
 * ClientID-to-DID Binding - Cryptographically bind Yjs clientIDs to DIDs
 *
 * Yjs assigns random integer clientIDs that have no cryptographic binding to
 * the author's identity. This module provides signed attestations that bind
 * a clientID to a DID for verifiable author attribution.
 */

import { hash, sign, verify } from '@xnet/crypto'
import { parseDID } from '@xnet/identity'

/**
 * A signed attestation binding a Yjs clientID to a DID.
 */
export interface ClientIdAttestation {
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

/**
 * Result of attestation verification.
 */
export interface AttestationVerifyResult {
  valid: boolean
  reason?: 'expired' | 'invalid_signature' | 'did_resolution_failed'
}

/**
 * Create the payload bytes for signing.
 */
function attestationPayload(
  clientId: number,
  did: string,
  room: string,
  expiresAt: number
): Uint8Array {
  const text = `clientid-bind:${clientId}:${did}:${room}:${expiresAt}`
  return new TextEncoder().encode(text)
}

/**
 * Create a signed clientID attestation.
 *
 * @param clientId - The Yjs clientID to attest
 * @param did - The DID claiming this clientID
 * @param privateKey - Ed25519 private key for signing
 * @param room - The room this attestation applies to
 * @param ttlSeconds - Time-to-live in seconds (default: 1 hour)
 * @returns Signed attestation
 *
 * @example
 * ```typescript
 * const attestation = createClientIdAttestation(
 *   doc.clientID,
 *   identity.did,
 *   privateKey,
 *   'xnet-doc-abc'
 * )
 * ws.send({ type: 'clientid-bind', room, attestation })
 * ```
 */
export function createClientIdAttestation(
  clientId: number,
  did: string,
  privateKey: Uint8Array,
  room: string,
  ttlSeconds = 3600
): ClientIdAttestation {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = attestationPayload(clientId, did, room, expiresAt)
  const payloadHash = hash(payload, 'blake3')
  const signature = sign(payloadHash, privateKey)

  return { clientId, did, signature, expiresAt, room }
}

/**
 * Verify a clientID attestation.
 *
 * Checks:
 * 1. Attestation has not expired
 * 2. DID is valid and can be parsed
 * 3. Signature is valid over the attestation payload
 *
 * @param attestation - The attestation to verify
 * @returns Verification result
 */
export function verifyClientIdAttestation(
  attestation: ClientIdAttestation
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
    const payload = attestationPayload(
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
 * Implementation of ClientIdMap for tracking clientID→DID bindings.
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
    // Remove any previous binding for this DID (re-join with new clientId)
    const prev = this.byDid.get(attestation.did)
    if (prev) {
      this.byClientId.delete(prev.clientId)
    }

    // Also remove any existing binding for this clientId
    const prevDid = this.byClientId.get(attestation.clientId)
    if (prevDid) {
      this.byDid.delete(prevDid.did)
    }

    this.byClientId.set(attestation.clientId, {
      did: attestation.did,
      expiresAt: attestation.expiresAt
    })
    this.byDid.set(attestation.did, {
      clientId: attestation.clientId,
      expiresAt: attestation.expiresAt
    })
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
