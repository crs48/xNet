/**
 * @xnet/sync - Unified sync primitives for xNet
 *
 * This package provides the foundational types and utilities for
 * synchronizing data across the xNet network. It supports both:
 * - Yjs CRDT documents (rich text, collaborative editing)
 * - Event-sourced records (databases, structured data)
 *
 * Core concepts:
 * - Change<T>: Universal unit of sync, replaces SignedUpdate and RecordOperation
 * - LamportTimestamp: Simple total ordering with DID tie-breaker
 * - Hash chains: Integrity verification and fork detection
 * - SyncProvider: Abstract interface for sync transports
 */

// Change types and functions
export type { Change, UnsignedChange, CreateChangeOptions } from './change'
export {
  CURRENT_PROTOCOL_VERSION,
  createUnsignedChange,
  computeChangeHash,
  signChange,
  verifyChange,
  verifyChangeHash,
  createChangeId,
  createBatchId
} from './change'

// Lamport clock utilities
export type { LamportTimestamp, LamportClock } from './clock'
export {
  createLamportClock,
  tick,
  receive,
  compareLamportTimestamps,
  isBefore,
  isAfter,
  serializeTimestamp,
  parseTimestamp,
  maxTime
} from './clock'

// Hash chain utilities
export type { ChainValidationResult, Fork } from './chain'
export {
  validateChain,
  detectFork,
  getChainHeads,
  getChainRoots,
  getAncestry,
  findCommonAncestor,
  getForks,
  topologicalSort
} from './chain'

// Sync provider interfaces
export type {
  SyncStatus,
  PeerInfo,
  SyncProviderEvents,
  SyncEventListener,
  SyncProvider,
  SyncProviderOptions
} from './provider'
export { BaseSyncProvider } from './provider'

// Yjs security: signed envelopes (Step 01)
export type { SignedYjsEnvelope, EnvelopeVerifyResult } from './yjs-envelope'
export { signYjsUpdate, verifyYjsEnvelope, hasSignedEnvelope, isLegacyUpdate } from './yjs-envelope'

// Yjs security: size and rate limits (Step 03)
export type { RateLimiterConfig } from './yjs-limits'
export {
  MAX_YJS_UPDATE_SIZE,
  MAX_YJS_UPDATES_PER_SECOND,
  MAX_YJS_UPDATES_PER_MINUTE,
  MAX_YJS_DOC_SIZE,
  YJS_SYNC_CHUNK_SIZE,
  YJS_RATE_BURST_ALLOWANCE,
  DEFAULT_RATE_LIMITER_CONFIG,
  YjsRateLimiter,
  isUpdateTooLarge,
  isDocumentTooLarge,
  calculateChunkCount,
  chunkUpdate,
  reassembleChunks
} from './yjs-limits'

// Yjs security: hash-at-rest integrity (Step 05)
export type { PersistedDocState } from './yjs-integrity'
export {
  hashYjsState,
  verifyYjsStateIntegrity,
  YjsIntegrityError,
  createPersistedDocState,
  verifyPersistedDocState,
  loadVerifiedState,
  shouldCompact,
  COMPACTION_UPDATE_THRESHOLD,
  COMPACTION_TIME_THRESHOLD
} from './yjs-integrity'

// Yjs security: peer scoring (Step 06)
export type {
  YjsPeerMetrics,
  YjsViolationType,
  PeerAction,
  YjsScoringConfig
} from './yjs-peer-scoring'
export { YjsPeerScorer, DEFAULT_YJS_SCORING_CONFIG } from './yjs-peer-scoring'

// Yjs security: clientID-DID binding (Step 07)
export type {
  ClientIdAttestation,
  AttestationVerifyResult,
  ClientIdMap
} from './clientid-attestation'
export {
  createClientIdAttestation,
  verifyClientIdAttestation,
  ClientIdMapImpl,
  validateClientIdOwnership
} from './clientid-attestation'

// Yjs security: hash chain integration (Step 08)
export type {
  YjsUpdatePayload,
  YjsChange,
  UnsignedYjsChange,
  CreateYjsChangeOptions
} from './yjs-change'
export {
  YJS_CHANGE_TYPE,
  createYjsChange,
  createUnsignedYjsChange,
  isYjsChange,
  isNodeChange,
  getChangeNodeId
} from './yjs-change'

// Yjs security: update batching (Step 08)
export type { YjsBatcherConfig, BatchFlushCallback, MergeUpdatesFn } from './yjs-batcher'
export { YjsBatcher, DEFAULT_BATCHER_CONFIG } from './yjs-batcher'
