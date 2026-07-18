/**
 * Change types for xNet sync primitives
 *
 * Change<T> is the universal unit of sync for both Yjs (CRDT) and
 * event-sourced (records) data. It replaces SignedUpdate and RecordOperation
 * with a single, generic type.
 */

import type { DID, ContentId } from '@xnetjs/core'
import { hashHex, sign, verify, verifyFast, verifyMany } from '@xnetjs/crypto'

// ─── Protocol Versioning ─────────────────────────────────────────────────────

/**
 * Current protocol version for Change<T>.
 *
 * Version history:
 * - 4: Grinding-resistant LWW tiebreak key (exploration 0300). NOTE: the change
 *   signature is still **Ed25519-only** — `signChange`/`verifyChange` use the
 *   classical `@xnetjs/crypto` `sign`/`verify`. The hybrid/ML-DSA apparatus
 *   (`hybrid-signing.ts`) is NOT wired into `Change<T>` yet; wiring it (or the
 *   PQ envelope) is tracked in exploration 0307.
 * - 3: Reserved for multi-level cryptography (hybrid Ed25519 + ML-DSA) — defined
 *   in the crypto layer but not carried by the change-signing path.
 * - 2: V2 compact format with abbreviated field names
 * - 1: Initial versioned protocol (adds protocolVersion field)
 * - 0/undefined: Legacy unversioned changes (backward compat)
 */
export const CURRENT_PROTOCOL_VERSION = 4

/**
 * A signed change with chain linkage and Lamport ordering.
 * Generic T allows different payload types for different use cases:
 * - YjsUpdate for rich text documents
 * - RecordPayload for database operations
 *
 * Changes can optionally be part of a transaction batch, which groups
 * related changes that should be applied atomically. This is important for:
 * - Multi-node operations (move task between projects)
 * - Undo/redo grouping
 * - Audit trails ("user did X" as a single action)
 * - Future blockchain integration (batch = transaction)
 */
export interface Change<T = unknown> {
  /**
   * Protocol version of this change.
   * - undefined: Legacy change (protocol v0, backward compat)
   * - 1+: Versioned change with protocol version
   *
   * Used for version negotiation and migration paths.
   */
  protocolVersion?: number

  /** Unique change ID (nanoid) */
  id: string

  /** Change type (e.g., 'yjs-update', 'create-item', 'update-item') */
  type: string

  /** The actual change data */
  payload: T

  /** Content-addressed hash of this change */
  hash: ContentId

  /** Hash of the previous change in the chain (null for first) */
  parentHash: ContentId | null

  /** DID of the author */
  authorDID: DID

  /** Ed25519 signature of the hash */
  signature: Uint8Array

  /** Wall clock timestamp (milliseconds) - for display, not ordering */
  wallTime: number

  /**
   * Lamport logical time for ordering (a plain integer). The author tiebreak
   * for LWW comes from `authorDID`; this field is just the clock value.
   */
  lamport: number

  // === Transaction Batch Support (optional) ===

  /**
   * Groups changes that should be treated as a single atomic operation.
   * All changes with the same batchId were created in one transaction.
   * For undo/redo, the entire batch should be undone/redone together.
   */
  batchId?: string

  /**
   * Position of this change within the batch (0-indexed).
   * Ensures deterministic ordering when replaying.
   */
  batchIndex?: number

  /**
   * Total number of changes in the batch.
   * Receivers can wait for all changes before committing.
   */
  batchSize?: number
}

/**
 * An unsigned change (before hash and signature are computed).
 * Used as input to signChange().
 */
export interface UnsignedChange<T = unknown> {
  protocolVersion?: number
  id: string
  type: string
  payload: T
  parentHash: ContentId | null
  authorDID: DID
  wallTime: number
  lamport: number

  // Batch fields (optional)
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

/**
 * Options for creating a change
 */
export interface CreateChangeOptions<T> {
  id: string
  type: string
  payload: T
  parentHash: ContentId | null
  authorDID: DID
  lamport: number
  wallTime?: number

  // Batch fields (optional) - for transaction support
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

/**
 * Create an unsigned change from options
 */
export function createUnsignedChange<T>(options: CreateChangeOptions<T>): UnsignedChange<T> {
  const unsigned: UnsignedChange<T> = {
    protocolVersion: CURRENT_PROTOCOL_VERSION,
    id: options.id,
    type: options.type,
    payload: options.payload,
    parentHash: options.parentHash,
    authorDID: options.authorDID,
    wallTime: options.wallTime ?? Date.now(),
    lamport: options.lamport
  }

  // Add batch fields if provided
  if (options.batchId !== undefined) {
    unsigned.batchId = options.batchId
    unsigned.batchIndex = options.batchIndex
    unsigned.batchSize = options.batchSize
  }

  return unsigned
}

/**
 * Generate a unique batch ID for grouping changes in a transaction.
 */
export function createBatchId(): string {
  return `batch-${crypto.randomUUID()}`
}

/**
 * Recursively sort object keys for canonical JSON representation.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
  }
  return sorted
}

/**
 * Compute the hash of an unsigned change.
 * The hash is computed over a canonical JSON representation with sorted keys.
 *
 * Version handling:
 * - protocolVersion 0/undefined (legacy): hash without protocolVersion field
 * - protocolVersion 1+: include protocolVersion in hash computation
 */
export function computeChangeHash<T>(unsigned: UnsignedChange<T>): ContentId {
  // For legacy changes (no protocolVersion), compute hash without the field
  // This maintains backward compatibility with existing change logs
  let toHash: unknown
  if (unsigned.protocolVersion === undefined || unsigned.protocolVersion === 0) {
    // Legacy format: exclude protocolVersion from hash
    // Create a copy without the protocolVersion field
    const legacy: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(unsigned)) {
      if (key !== 'protocolVersion') {
        legacy[key] = value
      }
    }
    toHash = legacy
  } else {
    // Versioned format: include protocolVersion in hash
    toHash = unsigned
  }

  // Create a canonical representation for hashing
  // Recursively sort all object keys for determinism
  const canonical = JSON.stringify(sortObjectKeys(toHash))
  const hashBytes = new TextEncoder().encode(canonical)
  return `cid:blake3:${hashHex(hashBytes)}` as ContentId
}

/**
 * Sign an unsigned change, producing a fully signed Change<T>.
 *
 * @param unsigned - The change to sign
 * @param signingKey - Ed25519 private key (32 bytes)
 * @returns Signed change with hash and signature
 */
export function signChange<T>(unsigned: UnsignedChange<T>, signingKey: Uint8Array): Change<T> {
  // Compute the hash
  const hash = computeChangeHash(unsigned)

  // Sign the hash
  const hashBytes = new TextEncoder().encode(hash)
  const signature = sign(hashBytes, signingKey)

  return {
    ...unsigned,
    hash,
    signature
  }
}

/**
 * Pluggable async change signer. Lets integrators move Ed25519 signing off
 * the interactive path (WebCrypto, a worker, or a remote signer) while
 * producing byte-identical signatures to {@link signChange}.
 */
export type ChangeSigner = <T>(unsigned: UnsignedChange<T>) => Promise<Change<T>>

// RFC 8410 PKCS#8 prefix for a raw 32-byte Ed25519 private key.
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
])

/**
 * Create a {@link ChangeSigner} backed by WebCrypto Ed25519.
 *
 * Ed25519 is deterministic (RFC 8032), so signatures are byte-identical to
 * the synchronous {@link signChange} path — only the execution moves off
 * the calling thread. Returns null when the runtime has no SubtleCrypto;
 * if WebCrypto rejects Ed25519 at runtime, the signer falls back to the
 * synchronous path transparently.
 */
export function createWebCryptoChangeSigner(signingKey: Uint8Array): ChangeSigner | null {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (!subtle || typeof subtle.importKey !== 'function') {
    return null
  }

  const pkcs8 = new Uint8Array(ED25519_PKCS8_PREFIX.length + 32)
  pkcs8.set(ED25519_PKCS8_PREFIX, 0)
  pkcs8.set(signingKey.subarray(0, 32), ED25519_PKCS8_PREFIX.length)

  let cryptoKeyPromise: Promise<CryptoKey> | null = null
  let webCryptoUnavailable = false

  const importSigningKey = (): Promise<CryptoKey> => {
    cryptoKeyPromise ??= subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign'])
    return cryptoKeyPromise
  }

  return async <T>(unsigned: UnsignedChange<T>): Promise<Change<T>> => {
    if (webCryptoUnavailable) {
      return signChange(unsigned, signingKey)
    }

    const hash = computeChangeHash(unsigned)
    try {
      const key = await importSigningKey()
      const signature = new Uint8Array(
        await subtle.sign('Ed25519', key, new TextEncoder().encode(hash))
      )
      return { ...unsigned, hash, signature }
    } catch {
      // Runtime lacks Ed25519 support (or rejected the key) — fall back to
      // the synchronous signer permanently for this signer instance.
      webCryptoUnavailable = true
      return signChange(unsigned, signingKey)
    }
  }
}

/**
 * Verify a change's signature against a public key.
 *
 * Protocol version handling:
 * - Accepts changes with protocolVersion <= CURRENT_PROTOCOL_VERSION
 * - Logs warning for future versions but still attempts verification
 * - Never rejects based on version alone (graceful degradation)
 *
 * @param change - The change to verify
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns true if the signature is valid
 */
export function verifyChange<T>(change: Change<T>, publicKey: Uint8Array): boolean {
  warnOnFutureProtocolVersion(change)

  // Verify the signature matches the hash
  const hashBytes = new TextEncoder().encode(change.hash)
  return verify(hashBytes, change.signature, publicKey)
}

/** Warn about future protocol versions but never reject on version alone. */
function warnOnFutureProtocolVersion<T>(change: Change<T>): void {
  const version = change.protocolVersion ?? 0
  if (version > CURRENT_PROTOCOL_VERSION) {
    console.warn(
      `[xnet/sync] Change ${change.id} uses protocol version ${version}, ` +
        `but current version is ${CURRENT_PROTOCOL_VERSION}. ` +
        `Consider upgrading xNet for full compatibility.`
    )
  }
}

/**
 * Verify a change's signature using the native (WebCrypto) verifier when the
 * runtime has it — ~13x faster than the pure-JS path (exploration 0350/0357).
 *
 * Semantically identical to {@link verifyChange}; use this on bulk paths
 * (hub relay, `.xnetpack` import, NDJSON restore, resync) where per-change
 * verification is the bottleneck. Single interactive writes can keep using
 * the synchronous {@link verifyChange}.
 */
export async function verifyChangeFast<T>(
  change: Change<T>,
  publicKey: Uint8Array
): Promise<boolean> {
  warnOnFutureProtocolVersion(change)
  const hashBytes = new TextEncoder().encode(change.hash)
  return verifyFast(hashBytes, change.signature, publicKey)
}

/**
 * Verify many changes at once. Results are positional — `result[i]`
 * corresponds to `entries[i]` — and a failure never short-circuits the rest,
 * so callers can report exactly which change was rejected.
 *
 * This shares one native-support probe and one key import per distinct author
 * across the whole set, which is the common shape for a bulk import.
 */
export async function verifyChangesFast<T>(
  entries: readonly { change: Change<T>; publicKey: Uint8Array }[]
): Promise<boolean[]> {
  const encoder = new TextEncoder()
  for (const entry of entries) warnOnFutureProtocolVersion(entry.change)
  return verifyMany(
    entries.map((entry) => ({
      message: encoder.encode(entry.change.hash),
      signature: entry.change.signature,
      publicKey: entry.publicKey
    }))
  )
}

/**
 * Recompute the content hash of a signed change from its own fields.
 *
 * Reconstructs the unsigned form (the exact field set that goes into the hash)
 * and runs {@link computeChangeHash}. This is the single source of truth for
 * "which fields are hashed" — {@link verifyChangeHash} is defined in terms of
 * it, and callers that need to *report* a mismatch (not just detect one) can
 * use it to surface the hash this build expects.
 */
export function recomputeChangeHash<T>(change: Change<T>): ContentId {
  // Reconstruct the unsigned change with only the fields that should be hashed
  const unsigned: UnsignedChange<T> = {
    id: change.id,
    type: change.type,
    payload: change.payload,
    parentHash: change.parentHash,
    authorDID: change.authorDID,
    wallTime: change.wallTime,
    lamport: change.lamport
  }

  // Include protocolVersion if present (versioned changes include it in hash)
  if (change.protocolVersion !== undefined) {
    unsigned.protocolVersion = change.protocolVersion
  }

  // Include batch fields if present (they're part of the signed data)
  if (change.batchId !== undefined) {
    unsigned.batchId = change.batchId
    unsigned.batchIndex = change.batchIndex
    unsigned.batchSize = change.batchSize
  }

  return computeChangeHash(unsigned)
}

/**
 * Verify that a change's hash is correct (not tampered).
 * This re-computes the hash from the change data and compares.
 *
 * Handles both legacy (no protocolVersion) and versioned changes.
 */
export function verifyChangeHash<T>(change: Change<T>): boolean {
  return recomputeChangeHash(change) === change.hash
}

/**
 * Create a unique change ID.
 * Uses crypto.randomUUID for uniqueness.
 */
export function createChangeId(): string {
  return crypto.randomUUID()
}
