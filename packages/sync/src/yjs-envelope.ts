/**
 * Signed Yjs Envelopes - Per-update signing and verification for Yjs sync messages
 *
 * Every outgoing Yjs update is wrapped in a signed envelope containing the author's DID
 * and an Ed25519 signature over the BLAKE3 hash of the update bytes.
 */

import { hash, sign, verify } from '@xnet/crypto'
import { parseDID } from '@xnet/identity'

/**
 * A signed envelope wrapping a Yjs update.
 */
export interface SignedYjsEnvelope {
  /** Raw Yjs update bytes */
  update: Uint8Array

  /** Author's DID (did:key:...) */
  authorDID: string

  /** Ed25519 signature over BLAKE3(update) */
  signature: Uint8Array

  /** Wall clock timestamp (for ordering/debugging) */
  timestamp: number

  /** Yjs clientID this author uses in this session */
  clientId: number
}

/**
 * Result of envelope verification.
 */
export interface EnvelopeVerifyResult {
  valid: boolean
  reason?: 'invalid_signature' | 'did_resolution_failed' | 'update_too_large'
}

/**
 * Sign a Yjs update, creating a SignedYjsEnvelope.
 *
 * @param update - Raw Yjs update bytes
 * @param authorDID - Author's DID (did:key:...)
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param clientId - Yjs clientID for this session
 * @returns SignedYjsEnvelope ready for transmission
 *
 * @example
 * ```typescript
 * const envelope = await signYjsUpdate(update, identity.did, privateKey, doc.clientID)
 * ws.send(encode({ type: 'sync-update', room, envelope }))
 * ```
 */
export function signYjsUpdate(
  update: Uint8Array,
  authorDID: string,
  privateKey: Uint8Array,
  clientId: number
): SignedYjsEnvelope {
  // Hash the update bytes with BLAKE3
  const updateHash = hash(update, 'blake3')

  // Sign the hash with Ed25519
  const signature = sign(updateHash, privateKey)

  return {
    update,
    authorDID,
    signature,
    timestamp: Date.now(),
    clientId
  }
}

/**
 * Verify a SignedYjsEnvelope.
 *
 * Checks:
 * 1. DID is valid and can be parsed to extract public key
 * 2. Signature is valid over BLAKE3(update)
 *
 * @param envelope - The envelope to verify
 * @returns EnvelopeVerifyResult indicating validity
 *
 * @example
 * ```typescript
 * const result = verifyYjsEnvelope(msg.envelope)
 * if (!result.valid) {
 *   console.warn(`Rejected: ${result.reason}`)
 *   return
 * }
 * Y.applyUpdate(doc, envelope.update, envelope.authorDID)
 * ```
 */
export function verifyYjsEnvelope(envelope: SignedYjsEnvelope): EnvelopeVerifyResult {
  try {
    // Extract public key from DID
    const publicKey = parseDID(envelope.authorDID)

    // Hash the update bytes
    const updateHash = hash(envelope.update, 'blake3')

    // Verify the signature
    const valid = verify(updateHash, envelope.signature, publicKey)

    if (!valid) {
      return { valid: false, reason: 'invalid_signature' }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'did_resolution_failed' }
  }
}

/**
 * Type guard to check if a message contains a signed envelope.
 */
export function hasSignedEnvelope(
  msg: unknown
): msg is { envelope: SignedYjsEnvelope; [key: string]: unknown } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'envelope' in msg &&
    typeof (msg as Record<string, unknown>).envelope === 'object' &&
    (msg as Record<string, unknown>).envelope !== null &&
    'update' in ((msg as Record<string, unknown>).envelope as object) &&
    'authorDID' in ((msg as Record<string, unknown>).envelope as object) &&
    'signature' in ((msg as Record<string, unknown>).envelope as object)
  )
}

/**
 * Check if a message is a legacy unsigned sync update.
 */
export function isLegacyUpdate(msg: unknown): msg is { data: Uint8Array; [key: string]: unknown } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'data' in msg &&
    (msg as Record<string, unknown>).data instanceof Uint8Array &&
    !('envelope' in msg)
  )
}
