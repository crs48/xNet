/**
 * Change types for xNet sync primitives
 *
 * Change<T> is the universal unit of sync for both Yjs (CRDT) and
 * event-sourced (records) data. It replaces SignedUpdate and RecordOperation
 * with a single, generic type.
 */

import type { LamportTimestamp } from './clock'
import type { DID, ContentId } from '@xnetjs/core'
import { hashHex, sign, verify } from '@xnetjs/crypto'

// ─── Protocol Versioning ─────────────────────────────────────────────────────

/**
 * Current protocol version for Change<T>.
 *
 * Version history:
 * - 3: Multi-level cryptography with hybrid signatures (Ed25519 + ML-DSA)
 * - 2: V2 compact format with abbreviated field names
 * - 1: Initial versioned protocol (adds protocolVersion field)
 * - 0/undefined: Legacy unversioned changes (backward compat)
 */
export const CURRENT_PROTOCOL_VERSION = 3

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

  /** Lamport timestamp for ordering */
  lamport: LamportTimestamp

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
  lamport: LamportTimestamp

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
  lamport: LamportTimestamp
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
  // Warn about future protocol versions but don't reject
  const version = change.protocolVersion ?? 0
  if (version > CURRENT_PROTOCOL_VERSION) {
    console.warn(
      `[xnet/sync] Change ${change.id} uses protocol version ${version}, ` +
        `but current version is ${CURRENT_PROTOCOL_VERSION}. ` +
        `Consider upgrading xNet for full compatibility.`
    )
  }

  // Verify the signature matches the hash
  const hashBytes = new TextEncoder().encode(change.hash)
  return verify(hashBytes, change.signature, publicKey)
}

/**
 * Verify that a change's hash is correct (not tampered).
 * This re-computes the hash from the change data and compares.
 *
 * Handles both legacy (no protocolVersion) and versioned changes.
 */
export function verifyChangeHash<T>(change: Change<T>): boolean {
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

  const computedHash = computeChangeHash(unsigned)
  return computedHash === change.hash
}

/**
 * Create a unique change ID.
 * Uses crypto.randomUUID for uniqueness.
 */
export function createChangeId(): string {
  return crypto.randomUUID()
}
