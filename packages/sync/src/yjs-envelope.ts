/**
 * Signed Yjs Envelopes - Per-update signing and verification for Yjs sync messages
 *
 * Every outgoing Yjs update is wrapped in a signed envelope containing the author's DID
 * and a multi-level signature (Ed25519 and/or ML-DSA-65) over the BLAKE3 hash of the
 * update bytes plus metadata.
 *
 * V2 introduces:
 * - Multi-level signature support (Level 0, 1, 2)
 * - Document ID binding
 * - Wire format with compact JSON encoding
 *
 * V1 is retained for backward compatibility.
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
  toBase64,
  fromBase64,
  type UnifiedSignature,
  type SignatureWire,
  type SecurityLevel,
  DEFAULT_SECURITY_LEVEL
} from '@xnetjs/crypto'
import { parseDID, type PQKeyRegistry, type HybridKeyBundle } from '@xnetjs/identity'

// ─── V1 Types (Legacy) ────────────────────────────────────────

/**
 * A signed envelope wrapping a Yjs update (V1 format).
 * @deprecated Use SignedYjsEnvelopeV2 for new code
 */
export interface SignedYjsEnvelopeV1 {
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

// ─── V2 Types (Multi-Level Signatures) ────────────────────────

/**
 * A signed envelope wrapping a Yjs update (V2 format with multi-level signatures).
 */
export interface SignedYjsEnvelopeV2 {
  /** Wire format version */
  v: 2

  /** Raw Yjs update bytes */
  update: Uint8Array

  /** Envelope metadata */
  meta: {
    /** Author's DID (did:key:...) */
    authorDID: DID

    /** Yjs clientID this author uses in this session */
    clientId: number

    /** Wall clock timestamp (ms since epoch) */
    timestamp: number

    /** Document ID this update applies to */
    docId: string
  }

  /** Multi-level signature over BLAKE3(update + meta) */
  signature: UnifiedSignature
}

/**
 * Wire format for SignedYjsEnvelopeV2 (compact JSON).
 */
export interface SignedYjsEnvelopeWire {
  v: 2
  /** Base64-encoded update bytes */
  u: string
  /** Metadata */
  m: {
    /** Author DID */
    a: string
    /** Client ID */
    c: number
    /** Timestamp */
    t: number
    /** Document ID */
    d: string
  }
  /** Signature (wire format) */
  s: SignatureWire
}

/**
 * Union type for all envelope versions.
 * Use `isV2Envelope()` to check the version.
 */
export type SignedYjsEnvelope = SignedYjsEnvelopeV1 | SignedYjsEnvelopeV2

// ─── V1 Result Types (Legacy) ────────────────────────────────

/**
 * Result of envelope verification (V1 format).
 * @deprecated Use EnvelopeVerificationResult for V2
 */
export interface EnvelopeVerifyResult {
  valid: boolean
  reason?: 'invalid_signature' | 'did_resolution_failed' | 'update_too_large'
}

// ─── V2 Result Types ─────────────────────────────────────────

/**
 * Result of envelope verification (V2 format with details).
 */
export interface EnvelopeVerificationResult {
  valid: boolean
  level: SecurityLevel
  errors: string[]
  authorDID: DID
  clientId: number
}

/**
 * Options for creating a signed envelope.
 */
export interface CreateEnvelopeOptions {
  /** Security level (default: 0 for Ed25519-only) */
  level?: SecurityLevel
}

/**
 * Options for envelope verification.
 */
export interface VerifyEnvelopeOptions {
  /** PQ key registry for Level 1/2 verification */
  registry?: PQKeyRegistry

  /** Expected document ID (optional, for extra validation) */
  expectedDocId?: string

  /** Maximum age in ms (optional, for freshness check) */
  maxAge?: number

  /** Minimum security level required */
  minLevel?: SecurityLevel

  /** Verification policy */
  policy?: 'strict' | 'permissive'
}

// ─── Type Guards ─────────────────────────────────────────────

/**
 * Check if an envelope is V2 format.
 */
export function isV2Envelope(envelope: SignedYjsEnvelope): envelope is SignedYjsEnvelopeV2 {
  return 'v' in envelope && envelope.v === 2
}

/**
 * Check if an envelope is V1 format.
 */
export function isV1Envelope(envelope: SignedYjsEnvelope): envelope is SignedYjsEnvelopeV1 {
  return !('v' in envelope)
}

// ─── V1 Functions (Legacy) ────────────────────────────────────

/**
 * Sign a Yjs update using V1 format (Ed25519 only).
 *
 * @deprecated Use signYjsUpdateV2() for new code
 *
 * @param update - Raw Yjs update bytes
 * @param authorDID - Author's DID (did:key:...)
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param clientId - Yjs clientID for this session
 * @returns SignedYjsEnvelopeV1 ready for transmission
 */
export function signYjsUpdateV1(
  update: Uint8Array,
  authorDID: string,
  privateKey: Uint8Array,
  clientId: number
): SignedYjsEnvelopeV1 {
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
 * Verify a V1 SignedYjsEnvelope.
 *
 * @deprecated Use verifyYjsEnvelopeV2() for V2 envelopes
 */
export function verifyYjsEnvelopeV1(envelope: SignedYjsEnvelopeV1): EnvelopeVerifyResult {
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

// ─── V2 Functions (Multi-Level) ───────────────────────────────

/**
 * Sign a Yjs update using V2 format with multi-level signatures.
 *
 * @param update - Raw Yjs update bytes
 * @param docId - Document ID this update applies to
 * @param clientId - Yjs clientID for this session
 * @param keyBundle - Key bundle for signing
 * @param options - Signing options
 * @returns SignedYjsEnvelopeV2 ready for transmission
 *
 * @example
 * ```typescript
 * const envelope = signYjsUpdateV2(update, 'doc-1', doc.clientID, keyBundle, { level: 1 })
 * ws.send(encode({ type: 'sync-update', room, envelope: serializeYjsEnvelope(envelope) }))
 * ```
 */
export function signYjsUpdateV2(
  update: Uint8Array,
  docId: string,
  clientId: number,
  keyBundle: HybridKeyBundle,
  options: CreateEnvelopeOptions = {}
): SignedYjsEnvelopeV2 {
  const { level = DEFAULT_SECURITY_LEVEL } = options

  const meta = {
    authorDID: keyBundle.identity.did,
    clientId,
    timestamp: Date.now(),
    docId
  }

  // Create signing input: hash of (update + canonical meta)
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta))
  const combined = new Uint8Array(update.length + metaBytes.length)
  combined.set(update, 0)
  combined.set(metaBytes, update.length)
  const signingHash = hash(combined, 'blake3')

  // Sign with hybrid
  const signature = hybridSign(
    signingHash,
    {
      ed25519: keyBundle.signingKey,
      mlDsa: keyBundle.pqSigningKey
    },
    level
  )

  return {
    v: 2,
    update,
    meta,
    signature
  }
}

/**
 * Sign multiple updates in a batch using V2 format.
 */
export function signYjsUpdateBatch(
  updates: Uint8Array[],
  docId: string,
  clientId: number,
  keyBundle: HybridKeyBundle,
  options: CreateEnvelopeOptions = {}
): SignedYjsEnvelopeV2[] {
  return updates.map((update) => signYjsUpdateV2(update, docId, clientId, keyBundle, options))
}

/**
 * Verify a V2 SignedYjsEnvelope with multi-level signature support.
 *
 * @param envelope - The envelope to verify
 * @param options - Verification options
 * @returns Verification result with detailed errors
 */
export async function verifyYjsEnvelopeV2(
  envelope: SignedYjsEnvelopeV2,
  options: VerifyEnvelopeOptions = {}
): Promise<EnvelopeVerificationResult> {
  const { registry, expectedDocId, maxAge, minLevel = 0, policy = 'strict' } = options
  const errors: string[] = []

  // Check document ID if specified
  if (expectedDocId && envelope.meta.docId !== expectedDocId) {
    errors.push(`Document ID mismatch: expected ${expectedDocId}, got ${envelope.meta.docId}`)
  }

  // Check freshness if specified
  if (maxAge) {
    const age = Date.now() - envelope.meta.timestamp
    if (age > maxAge) {
      errors.push(`Envelope too old: ${age}ms > ${maxAge}ms`)
    }
  }

  // Check minimum security level
  if (envelope.signature.level < minLevel) {
    errors.push(
      `Security level too low: ${envelope.signature.level} < ${minLevel} (required minimum)`
    )
  }

  // Get public keys
  let ed25519PublicKey: Uint8Array
  try {
    ed25519PublicKey = parseDID(envelope.meta.authorDID)
  } catch {
    errors.push('Failed to parse author DID')
    return {
      valid: false,
      level: envelope.signature.level,
      errors,
      authorDID: envelope.meta.authorDID,
      clientId: envelope.meta.clientId
    }
  }

  let pqPublicKey: Uint8Array | undefined

  if (envelope.signature.level >= 1 && registry) {
    const lookedUp = await registry.lookup(envelope.meta.authorDID)
    pqPublicKey = lookedUp ?? undefined
  }

  // Reconstruct signing input
  const metaBytes = new TextEncoder().encode(JSON.stringify(envelope.meta))
  const combined = new Uint8Array(envelope.update.length + metaBytes.length)
  combined.set(envelope.update, 0)
  combined.set(metaBytes, envelope.update.length)
  const signingHash = hash(combined, 'blake3')

  // Verify signature
  const result = hybridVerify(
    signingHash,
    envelope.signature,
    { ed25519: ed25519PublicKey, mlDsa: pqPublicKey },
    { minLevel, policy }
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
    level: envelope.signature.level,
    errors,
    authorDID: envelope.meta.authorDID,
    clientId: envelope.meta.clientId
  }
}

/**
 * Quick verification returning just boolean.
 */
export async function verifyYjsEnvelopeQuick(
  envelope: SignedYjsEnvelopeV2,
  options: VerifyEnvelopeOptions = {}
): Promise<boolean> {
  const result = await verifyYjsEnvelopeV2(envelope, options)
  return result.valid
}

// ─── Serialization ───────────────────────────────────────────

/**
 * Serialize V2 envelope to wire format.
 */
export function serializeYjsEnvelope(envelope: SignedYjsEnvelopeV2): SignedYjsEnvelopeWire {
  return {
    v: 2,
    u: toBase64(envelope.update),
    m: {
      a: envelope.meta.authorDID,
      c: envelope.meta.clientId,
      t: envelope.meta.timestamp,
      d: envelope.meta.docId
    },
    s: encodeSignature(envelope.signature)
  }
}

/**
 * Deserialize V2 envelope from wire format.
 */
export function deserializeYjsEnvelope(wire: SignedYjsEnvelopeWire): SignedYjsEnvelopeV2 {
  if (wire.v !== 2) {
    throw new Error(`Unsupported envelope version: ${wire.v}. Expected version 2.`)
  }

  return {
    v: 2,
    update: fromBase64(wire.u),
    meta: {
      authorDID: wire.m.a as DID,
      clientId: wire.m.c,
      timestamp: wire.m.t,
      docId: wire.m.d
    },
    signature: decodeSignature(wire.s)
  }
}

/**
 * Calculate envelope size in bytes (approximate).
 */
export function envelopeSize(envelope: SignedYjsEnvelopeV2): number {
  let size = envelope.update.length
  size += JSON.stringify(envelope.meta).length
  if (envelope.signature.ed25519) size += envelope.signature.ed25519.length
  if (envelope.signature.mlDsa) size += envelope.signature.mlDsa.length
  return size
}

// ─── Unified API (Auto-Detect Version) ────────────────────────

/**
 * Sign a Yjs update, creating a SignedYjsEnvelope.
 *
 * This is the main API for signing updates. It creates a V1 envelope
 * for backward compatibility when using simple Ed25519 keys, or a V2
 * envelope when using a HybridKeyBundle.
 *
 * @overload V1 signature (legacy)
 * @param update - Raw Yjs update bytes
 * @param authorDID - Author's DID (did:key:...)
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param clientId - Yjs clientID for this session
 */
export function signYjsUpdate(
  update: Uint8Array,
  authorDID: string,
  privateKey: Uint8Array,
  clientId: number
): SignedYjsEnvelopeV1

/**
 * @overload V2 signature (multi-level)
 * @param update - Raw Yjs update bytes
 * @param docId - Document ID this update applies to
 * @param clientId - Yjs clientID for this session
 * @param keyBundle - Key bundle for signing
 * @param options - Signing options
 */
export function signYjsUpdate(
  update: Uint8Array,
  docId: string,
  clientId: number,
  keyBundle: HybridKeyBundle,
  options?: CreateEnvelopeOptions
): SignedYjsEnvelopeV2

export function signYjsUpdate(
  update: Uint8Array,
  authorDIDOrDocId: string,
  privateKeyOrClientId: Uint8Array | number,
  clientIdOrKeyBundle: number | HybridKeyBundle,
  options?: CreateEnvelopeOptions
): SignedYjsEnvelope {
  // V2 format: (update, docId, clientId, keyBundle, options?)
  if (typeof privateKeyOrClientId === 'number') {
    return signYjsUpdateV2(
      update,
      authorDIDOrDocId,
      privateKeyOrClientId,
      clientIdOrKeyBundle as HybridKeyBundle,
      options
    )
  }

  // V1 format: (update, authorDID, privateKey, clientId)
  return signYjsUpdateV1(
    update,
    authorDIDOrDocId,
    privateKeyOrClientId,
    clientIdOrKeyBundle as number
  )
}

/**
 * Verify a SignedYjsEnvelope (auto-detects version).
 *
 * For V1 envelopes, returns a simple valid/reason result.
 * For V2 envelopes, returns a detailed verification result.
 *
 * @param envelope - The envelope to verify
 * @param options - Verification options (V2 only)
 */
export function verifyYjsEnvelope(envelope: SignedYjsEnvelopeV1): EnvelopeVerifyResult
export function verifyYjsEnvelope(
  envelope: SignedYjsEnvelopeV2,
  options?: VerifyEnvelopeOptions
): Promise<EnvelopeVerificationResult>
export function verifyYjsEnvelope(
  envelope: SignedYjsEnvelope,
  options?: VerifyEnvelopeOptions
): EnvelopeVerifyResult | Promise<EnvelopeVerificationResult> {
  if (isV2Envelope(envelope)) {
    return verifyYjsEnvelopeV2(envelope, options)
  }
  return verifyYjsEnvelopeV1(envelope)
}

// ─── Type Guards for Messages ─────────────────────────────────

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
    ('authorDID' in ((msg as Record<string, unknown>).envelope as object) ||
      'meta' in ((msg as Record<string, unknown>).envelope as object)) &&
    ('signature' in ((msg as Record<string, unknown>).envelope as object) ||
      'v' in ((msg as Record<string, unknown>).envelope as object))
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
