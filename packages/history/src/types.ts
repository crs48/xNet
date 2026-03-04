/**
 * @xnetjs/history - Types for history, audit & time travel
 */

import type { DID, ContentId } from '@xnetjs/core'
import type { NodeChange, NodeState, NodeId, SchemaIRI } from '@xnetjs/data'
import type { LamportTimestamp } from '@xnetjs/sync'

// ─── History Targeting ───────────────────────────────────────

/** How to specify a point in time */
export type HistoryTarget =
  | { type: 'lamport'; time: number }
  | { type: 'wall'; timestamp: number }
  | { type: 'hash'; hash: ContentId }
  | { type: 'index'; index: number }
  | { type: 'relative'; offset: number }
  | { type: 'latest' }

// ─── Materialized Historical State ──────────────────────────

/** Result of point-in-time reconstruction */
export interface HistoricalState {
  node: NodeState
  target: HistoryTarget
  changeIndex: number
  totalChanges: number
  timestamp: number
  author: DID
  changeHash: ContentId
}

// ─── Timeline Entries ────────────────────────────────────────

/** A single entry in the timeline */
export interface TimelineEntry {
  index: number
  change: NodeChange
  properties: string[]
  operation: 'create' | 'update' | 'delete' | 'restore'
  author: DID
  wallTime: number
  lamport: LamportTimestamp
  batchId?: string
  batchSize?: number
}

// ─── Diffs ───────────────────────────────────────────────────

/** Diff between two property values */
export interface PropertyDiff {
  property: string
  before: unknown
  after: unknown
  type: 'added' | 'modified' | 'removed'
  changedAt: number
  changedBy: DID
}

/** Full diff result between two points */
export interface DiffResult {
  nodeId: NodeId
  from: HistoryTarget
  to: HistoryTarget
  diffs: PropertyDiff[]
  summary: {
    added: number
    modified: number
    removed: number
  }
}

// ─── Audit ───────────────────────────────────────────────────

/** Query parameters for audit log */
export interface AuditQuery {
  nodeId?: NodeId
  nodeIds?: NodeId[]
  schemaIRI?: SchemaIRI
  author?: DID
  authors?: DID[]
  fromWallTime?: number
  toWallTime?: number
  fromLamport?: number
  toLamport?: number
  operations?: ('create' | 'update' | 'delete' | 'restore')[]
  batchId?: string
  properties?: string[]
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

/** A single audit entry */
export interface AuditEntry {
  change: NodeChange
  operation: 'create' | 'update' | 'delete' | 'restore'
  author: DID
  wallTime: number
  lamport: LamportTimestamp
  nodeId: NodeId
  schemaIRI: SchemaIRI
  properties: string[]
  batchId?: string
  batchSize?: number
}

/** Summary of activity */
export interface ActivitySummary {
  totalChanges: number
  creates: number
  updates: number
  deletes: number
  restores: number
  authors: DID[]
  firstChange: number
  lastChange: number
  topProperties: { property: string; count: number }[]
}

// ─── Blame ───────────────────────────────────────────────────

/** Per-property blame info */
export interface BlameInfo {
  property: string
  currentValue: unknown
  lastChangedBy: DID
  lastChangedAt: number
  totalEdits: number
  history: PropertyHistoryEntry[]
}

/** A single historical value for a property */
export interface PropertyHistoryEntry {
  value: unknown
  author: DID
  wallTime: number
  lamport: LamportTimestamp
  changeHash: ContentId
  changeIndex: number
}

// ─── Yjs Document Snapshots ──────────────────────────────────

/** A Yjs document snapshot stored for time travel */
export interface YjsSnapshot {
  /** Node this snapshot belongs to */
  nodeId: NodeId
  /** When this snapshot was captured */
  timestamp: number
  /** Serialized Yjs snapshot (from Y.encodeSnapshot) */
  snapshot: Uint8Array
  /** Serialized full doc state at capture time (from Y.encodeStateAsUpdate) */
  docState: Uint8Array
  /** Byte size of the snapshot */
  byteSize: number
}

/** Storage adapter for Yjs document snapshots */
export interface YjsSnapshotStorageAdapter {
  saveYjsSnapshot(snapshot: YjsSnapshot): Promise<void>
  getYjsSnapshots(nodeId: NodeId): Promise<YjsSnapshot[]>
  deleteYjsSnapshots(nodeId: NodeId): Promise<void>
}

/** A document change entry for the unified timeline */
export interface DocumentTimelineEntry {
  type: 'document'
  /** Index within the document snapshot list */
  snapshotIndex: number
  /** Wall clock time */
  wallTime: number
  /** Byte size of the doc state at this point */
  byteSize: number
}

/** Unified timeline entry — either a property change or a document snapshot */
export type UnifiedTimelineEntry = (TimelineEntry & { type: 'property' }) | DocumentTimelineEntry

// ─── Snapshots ───────────────────────────────────────────────

/** A snapshot of node state at a specific change index */
export interface Snapshot {
  nodeId: NodeId
  changeIndex: number
  changeHash: ContentId
  state: NodeState
  createdAt: number
  byteSize?: number
}

/** Snapshot cache configuration */
export interface SnapshotCacheOptions {
  /** Create a snapshot every N changes (default: 100) */
  interval: number
  /** Maximum snapshots to keep per node (default: 50) */
  maxPerNode: number
  /** Maximum total cache size in bytes (default: 50MB) */
  maxTotalBytes: number
}

/** Snapshot cache statistics */
export interface CacheStats {
  totalSnapshots: number
  totalBytes: number
  nodeCount: number
}

// ─── Verification ────────────────────────────────────────────

/** Types of verification errors */
export type VerificationErrorType =
  | 'tampered-hash'
  | 'invalid-signature'
  | 'broken-chain'
  | 'clock-anomaly'
  | 'orphan-change'

/** A single verification error */
export interface VerificationError {
  changeHash: ContentId
  changeIndex: number
  type: VerificationErrorType
  details: string
  authorDID: DID
  wallTime: number
}

/** Verification statistics */
export interface VerificationStats {
  totalChanges: number
  verifiedHashes: number
  verifiedSignatures: number
  validChainLinks: number
  authors: DID[]
  timespan: [number, number]
  forks: number
  heads: number
  roots: number
}

/** Full verification result */
export interface VerificationResult {
  valid: boolean
  errors: VerificationError[]
  stats: VerificationStats
  duration: number
}

/** Options for verification */
export interface VerificationOptions {
  skipSignatures?: boolean
  resolvePublicKey?: (did: DID) => Promise<Uint8Array | null>
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

// ─── Pruning ─────────────────────────────────────────────────

/** Policy controlling what can be pruned */
export interface PruningPolicy {
  keepRecentChanges: number
  minAge: number
  pruneThreshold: number
  requireVerifiedSnapshot: boolean
  protectedSchemas?: SchemaIRI[]
  storageBudget?: number
}

/** A node eligible for pruning */
export interface PruneCandidate {
  nodeId: NodeId
  totalChanges: number
  prunableChanges: number
  snapshotIndex: number
  estimatedRecovery: number
}

/** Result of a prune operation */
export interface PruneResult {
  nodeId: NodeId
  deletedChanges: number
  recoveredBytes: number
  duration: number
}

/** Options for a prune operation */
export interface PruneOptions {
  dryRun?: boolean
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

// ─── Undo/Redo ───────────────────────────────────────────────

/** A single undo stack entry */
export interface UndoEntry {
  changeHash: ContentId
  nodeId: NodeId
  previousValues: Record<string, unknown>
  currentValues: Record<string, unknown>
  batchId?: string
  wallTime: number
  /** True if this entry represents a delete operation */
  wasDelete?: boolean
  /** True if this entry represents a restore operation */
  wasRestore?: boolean
}

/** UndoManager configuration */
export interface UndoManagerOptions {
  maxStackSize: number
  localOnly: boolean
  mergeInterval: number
}

// ─── Playback ────────────────────────────────────────────────

/** Playback state */
export type PlaybackState = 'stopped' | 'playing' | 'paused'

// ─── Schema Timeline ─────────────────────────────────────────

/** Timeline entry for multi-node (schema/database) view */
export interface SchemaTimelineEntry extends TimelineEntry {
  nodeId: NodeId
  nodeName?: string
}
