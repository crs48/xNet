/**
 * Change types for xNet sync primitives
 *
 * Change<T> is the universal unit of sync for both Yjs (CRDT) and
 * event-sourced (records) data. It replaces SignedUpdate and RecordOperation
 * with a single, generic type.
 */

import type { DID, ContentId, VectorClock } from '@xnet/core'
import { hashHex, sign, verify } from '@xnet/crypto'

/**
 * A signed change with chain linkage and causal ordering.
 * Generic T allows different payload types for different use cases:
 * - YjsUpdate for rich text documents
 * - RecordPayload for database operations
 */
export interface Change<T = unknown> {
  /** Unique change ID */
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

  /** Unix timestamp (milliseconds) */
  timestamp: number

  /** Vector clock for causal ordering */
  vectorClock: VectorClock
}

/**
 * An unsigned change (before hash and signature are computed).
 * Used as input to signChange().
 */
export interface UnsignedChange<T = unknown> {
  id: string
  type: string
  payload: T
  parentHash: ContentId | null
  authorDID: DID
  timestamp: number
  vectorClock: VectorClock
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
  vectorClock: VectorClock
  timestamp?: number
}

/**
 * Create an unsigned change from options
 */
export function createUnsignedChange<T>(options: CreateChangeOptions<T>): UnsignedChange<T> {
  return {
    id: options.id,
    type: options.type,
    payload: options.payload,
    parentHash: options.parentHash,
    authorDID: options.authorDID,
    timestamp: options.timestamp ?? Date.now(),
    vectorClock: options.vectorClock
  }
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
 */
export function computeChangeHash<T>(unsigned: UnsignedChange<T>): ContentId {
  // Create a canonical representation for hashing
  // Recursively sort all object keys for determinism
  const canonical = JSON.stringify(sortObjectKeys(unsigned))
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
 * @param change - The change to verify
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns true if the signature is valid
 */
export function verifyChange<T>(change: Change<T>, publicKey: Uint8Array): boolean {
  // Verify the signature matches the hash
  const hashBytes = new TextEncoder().encode(change.hash)
  return verify(hashBytes, change.signature, publicKey)
}

/**
 * Verify that a change's hash is correct (not tampered).
 * This re-computes the hash from the change data and compares.
 */
export function verifyChangeHash<T>(change: Change<T>): boolean {
  // Reconstruct the unsigned change with only the fields that should be hashed
  const unsigned: UnsignedChange<T> = {
    id: change.id,
    type: change.type,
    payload: change.payload,
    parentHash: change.parentHash,
    authorDID: change.authorDID,
    timestamp: change.timestamp,
    vectorClock: change.vectorClock
  }
  const computedHash = computeChangeHash(unsigned)
  return computedHash === change.hash
}

/**
 * Create a unique change ID.
 * Format: {timestamp}-{random}
 */
export function createChangeId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}`
}
