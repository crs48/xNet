/**
 * @xnet/history - History, audit & time travel for xNet
 *
 * Exposes the event-sourced change log to power Time Machine scrubbers,
 * undo/redo, audit trails, diffs, and cryptographic verification.
 */

// ─── Types ───────────────────────────────────────────────────
export type {
  HistoryTarget,
  HistoricalState,
  TimelineEntry,
  PropertyDiff,
  DiffResult,
  AuditQuery,
  AuditEntry,
  ActivitySummary,
  BlameInfo,
  PropertyHistoryEntry,
  Snapshot,
  SnapshotCacheOptions,
  CacheStats,
  VerificationErrorType,
  VerificationError,
  VerificationStats,
  VerificationResult,
  VerificationOptions,
  PruningPolicy,
  PruneCandidate,
  PruneResult,
  PruneOptions,
  UndoEntry,
  UndoManagerOptions,
  PlaybackState,
  SchemaTimelineEntry
} from './types'

// ─── Core Engine ─────────────────────────────────────────────
export { HistoryEngine, createEmptyState, applyChangeToState, inferOperation } from './engine'

// ─── Snapshot Cache ──────────────────────────────────────────
export { SnapshotCache, MemorySnapshotStorage, setupAutoSnapshots } from './snapshot-cache'
export type { SnapshotStorageAdapter } from './snapshot-cache'

// ─── Audit Index ─────────────────────────────────────────────
export { AuditIndex } from './audit-index'

// ─── Undo/Redo ───────────────────────────────────────────────
export { UndoManager } from './undo-manager'

// ─── Scrub Cache ─────────────────────────────────────────────
export { ScrubCache } from './scrub-cache'

// ─── Playback ────────────────────────────────────────────────
export { PlaybackEngine } from './playback'
export type { PlaybackListener } from './playback'

// ─── Diff & Blame ────────────────────────────────────────────
export { DiffEngine } from './diff'
export { BlameEngine } from './blame'

// ─── Verification & Pruning ──────────────────────────────────
export { VerificationEngine } from './verification'
export { PruningEngine, DEFAULT_POLICY, MOBILE_POLICY } from './pruning'
export type { PrunableStorageAdapter } from './pruning'

// ─── Schema Timeline (Database Time Machine) ─────────────────
export { SchemaTimeline, restoreSchemaAt } from './schema-timeline'
export { SchemaScrubCache } from './schema-scrub-cache'

// ─── Utilities ───────────────────────────────────────────────
export { deepEqual } from './utils'
