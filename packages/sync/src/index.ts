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
 * - VectorClock: Causal ordering of distributed events
 * - Hash chains: Integrity verification and fork detection
 * - SyncProvider: Abstract interface for sync transports
 */

// Change types and functions
export type { Change, UnsignedChange, CreateChangeOptions } from './change'
export {
  createUnsignedChange,
  computeChangeHash,
  signChange,
  verifyChange,
  verifyChangeHash,
  createChangeId
} from './change'

// Vector clock utilities
export type { VectorClock } from './clock'
export {
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  happenedBefore,
  happenedAfter,
  areConcurrent,
  areEqual,
  isValidProgression,
  getMaxTime,
  getNodes
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
