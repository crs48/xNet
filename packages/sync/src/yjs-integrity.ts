/**
 * Yjs State Integrity - Hash-at-Rest for Yjs document state
 *
 * Provides utilities to hash Yjs state on persist and verify on load,
 * detecting storage-level corruption before it propagates.
 */

import { hashHex } from '@xnetjs/crypto'

/**
 * Compute a BLAKE3 hash of Yjs state bytes.
 *
 * @param state - Yjs state bytes (from Y.encodeStateAsUpdate)
 * @returns Hex-encoded BLAKE3 hash
 */
export function hashYjsState(state: Uint8Array): string {
  return hashHex(state, 'blake3')
}

/**
 * Verify that Yjs state bytes match an expected hash.
 *
 * @param state - Yjs state bytes to verify
 * @param expectedHash - Expected hex-encoded BLAKE3 hash
 * @returns true if hashes match, false if corrupted
 */
export function verifyYjsStateIntegrity(state: Uint8Array, expectedHash: string): boolean {
  return hashYjsState(state) === expectedHash
}

/**
 * Error thrown when Yjs state is corrupted (hash mismatch).
 */
export class YjsIntegrityError extends Error {
  constructor(
    public readonly docId: string,
    public readonly expectedHash: string,
    public readonly actualHash: string
  ) {
    super(
      `Yjs state corrupted for doc ${docId}: expected ${expectedHash.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`
    )
    this.name = 'YjsIntegrityError'
  }
}

/**
 * Persisted Yjs document state with integrity hash.
 */
export interface PersistedDocState {
  /** The raw Yjs state (Y.encodeStateAsUpdate) */
  state: Uint8Array
  /** BLAKE3 hex hash of state bytes */
  hash: string
  /** When this was persisted */
  persistedAt: number
  /** Number of updates merged since last snapshot */
  updateCount: number
}

/**
 * Create a PersistedDocState from Yjs state bytes.
 *
 * @param state - Yjs state bytes
 * @param updateCount - Number of updates in this state (default: 0)
 * @returns PersistedDocState with computed hash
 */
export function createPersistedDocState(state: Uint8Array, updateCount = 0): PersistedDocState {
  return {
    state,
    hash: hashYjsState(state),
    persistedAt: Date.now(),
    updateCount
  }
}

/**
 * Verify a PersistedDocState's integrity.
 *
 * @param docId - Document ID (for error reporting)
 * @param record - The persisted state record
 * @throws YjsIntegrityError if hash doesn't match
 */
export function verifyPersistedDocState(docId: string, record: PersistedDocState): void {
  const actualHash = hashYjsState(record.state)
  if (actualHash !== record.hash) {
    throw new YjsIntegrityError(docId, record.hash, actualHash)
  }
}

/**
 * Safely load Yjs state, verifying integrity if hash is present.
 *
 * @param docId - Document ID
 * @param record - The persisted state record (may be legacy without hash)
 * @returns The state bytes
 * @throws YjsIntegrityError if hash exists and doesn't match
 */
export function loadVerifiedState(
  docId: string,
  record: Partial<PersistedDocState> & { state: Uint8Array }
): Uint8Array {
  // Legacy records without hash: return as-is (will get hash on next persist)
  if (!record.hash) {
    return record.state
  }

  // Verify integrity
  if (!verifyYjsStateIntegrity(record.state, record.hash)) {
    throw new YjsIntegrityError(docId, record.hash, hashYjsState(record.state))
  }

  return record.state
}

/**
 * Constants for compaction thresholds.
 */

/** Compact (re-encode and re-hash) after this many incremental updates */
export const COMPACTION_UPDATE_THRESHOLD = 100

/** Compact after this much time (ms) since last compaction */
export const COMPACTION_TIME_THRESHOLD = 3600_000 // 1 hour

/**
 * Check if a document should be compacted.
 *
 * @param updateCount - Number of updates since last compaction
 * @param persistedAt - When the state was last persisted
 * @returns true if compaction is recommended
 */
export function shouldCompact(updateCount: number, persistedAt: number): boolean {
  if (updateCount >= COMPACTION_UPDATE_THRESHOLD) {
    return true
  }
  if (Date.now() - persistedAt > COMPACTION_TIME_THRESHOLD) {
    return true
  }
  return false
}
