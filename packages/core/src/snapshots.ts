/**
 * Snapshot types and logic for xNet CRDT persistence
 */
import type { ContentId } from './content'
import type { SignedUpdate } from './updates'

/**
 * Triggers for when to create a new snapshot
 */
export interface SnapshotTriggers {
  updateCount: number // e.g., 10000
  timeInterval: number // e.g., 24 * 60 * 60 * 1000 (24h)
  storagePressure: number // e.g., 0.8 (80%)
}

/**
 * A snapshot represents a compressed CRDT state at a point in time
 */
export interface Snapshot {
  id: string
  documentId: string
  stateVector: Uint8Array // Which updates are included
  compressedState: Uint8Array // Full CRDT state, compressed
  timestamp: number
  creatorDID: string
  signature: Uint8Array
  contentId: ContentId // CID of the snapshot
}

/**
 * What's needed to load a document
 */
export interface DocumentLoad {
  snapshot?: Snapshot
  updatesSinceSnapshot: SignedUpdate[]
}

/**
 * Default snapshot triggers
 */
export const DEFAULT_SNAPSHOT_TRIGGERS: SnapshotTriggers = {
  updateCount: 10000,
  timeInterval: 24 * 60 * 60 * 1000, // 24 hours
  storagePressure: 0.8 // 80%
}

/**
 * Determine if a new snapshot should be created
 */
export function shouldCreateSnapshot(
  updateCount: number,
  lastSnapshotTime: number,
  storageUsed: number,
  storageTotal: number,
  triggers: SnapshotTriggers = DEFAULT_SNAPSHOT_TRIGGERS
): boolean {
  // Trigger on update count
  if (updateCount >= triggers.updateCount) return true

  // Trigger on time interval
  if (Date.now() - lastSnapshotTime >= triggers.timeInterval) return true

  // Trigger on storage pressure
  if (storageTotal > 0 && storageUsed / storageTotal >= triggers.storagePressure) return true

  return false
}

/**
 * Calculate the effective state vector after applying updates
 */
export function mergeStateVectors(base: Uint8Array, _updates: SignedUpdate[]): Uint8Array {
  // State vectors are implementation-specific to the CRDT library (Yjs)
  // This is a placeholder - actual implementation in @xnetjs/data
  return base
}
