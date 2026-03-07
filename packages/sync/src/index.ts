/**
 * @xnetjs/sync - Unified sync primitives for xNet
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

// Sync runtime lifecycle
export type {
  SyncConnectionStatus,
  SyncLifecycleInput,
  SyncLifecyclePhase,
  SyncLifecycleState
} from './sync-runtime'
export { createSyncLifecycleState, deriveSyncLifecyclePhase } from './sync-runtime'

export type {
  SyncCompatibilityConfig,
  SyncReplicationConfig,
  ResolvedSyncReplicationPolicy
} from './replication-policy'
export { resolveSyncReplicationPolicy } from './replication-policy'

// Yjs security: signed envelopes (Step 01 + Multi-level signatures)
export type {
  SignedYjsEnvelope,
  SignedYjsEnvelopeV1,
  SignedYjsEnvelopeV2,
  SignedYjsEnvelopeWire,
  EnvelopeVerifyResult,
  EnvelopeVerificationResult,
  CreateEnvelopeOptions,
  VerifyEnvelopeOptions
} from './yjs-envelope'
export {
  signYjsUpdate,
  signYjsUpdateV1,
  signYjsUpdateV2,
  signYjsUpdateBatch,
  verifyYjsEnvelope,
  verifyYjsEnvelopeV1,
  verifyYjsEnvelopeV2,
  verifyYjsEnvelopeQuick,
  serializeYjsEnvelope,
  deserializeYjsEnvelope,
  envelopeSize,
  isV1Envelope,
  isV2Envelope,
  hasSignedEnvelope,
  isLegacyUpdate
} from './yjs-envelope'

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

// Yjs authorization primitives (Step 09)
export type {
  EncryptedYjsState,
  YjsAuthDecision,
  YjsAuthGateOptions,
  YjsCheckpointerOptions
} from './yjs-authorization'
export {
  YjsStateIntegrityError,
  encryptYjsState,
  decryptYjsState,
  serializeEncryptedYjsState,
  deserializeEncryptedYjsState,
  YjsAuthGate,
  YjsCheckpointer,
  toEncryptedData
} from './yjs-authorization'

export type {
  YDocLike,
  YDocCodec,
  AuthorizedRoom,
  AuthorizedDoc,
  AuthorizedStateAdapter,
  GrantEventStore,
  ContentKeyProvider,
  RecipientKeyResolver,
  AuthorizedSyncManagerOptions,
  AuthorizedYjsSyncProviderOptions
} from './yjs-authorized-sync'
export {
  AuthorizedSyncManager,
  AuthorizedYjsSyncProvider,
  AuthorizedYjsError
} from './yjs-authorized-sync'

// Yjs security: clientID-DID binding (Step 07 + Multi-level signatures)
export type {
  ClientIdAttestation,
  ClientIdAttestationV1,
  ClientIdAttestationV2,
  ClientIdAttestationWire,
  AttestationVerifyResult,
  AttestationVerificationResult,
  CreateAttestationOptions,
  VerifyAttestationOptions,
  ClientIdMap
} from './clientid-attestation'
export {
  createClientIdAttestation,
  createClientIdAttestationV1,
  createClientIdAttestationV2,
  verifyClientIdAttestation,
  verifyClientIdAttestationV1,
  verifyClientIdAttestationV2,
  serializeClientIdAttestation,
  deserializeClientIdAttestation,
  isV1Attestation,
  isV2Attestation,
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

// Feature flags and capability negotiation
export type {
  FeatureFlag,
  FeatureConfig,
  FeatureValidationResult,
  FeatureValidationError,
  FeatureValidationWarning
} from './features'
export {
  FEATURES,
  ALL_FEATURES,
  getEnabledFeatures,
  isFeatureEnabled,
  getRequiredFeatures,
  getOptionalFeatures,
  getFeatureVersion,
  isFeatureAvailable,
  getFeatureDependencies,
  getFeatureConflicts,
  getAllDependencies,
  validateFeatureSet,
  intersectFeatures,
  diffFeatures,
  addDependencies
} from './features'

// Version negotiation
export type {
  PeerCapabilities,
  NegotiatedSession,
  NegotiationFailure,
  NegotiationWarning,
  NegotiationResult
} from './negotiation'
export {
  VersionNegotiator,
  defaultNegotiator,
  createLocalCapabilities,
  parseCapabilities
} from './negotiation'

// Serializers for version-specific wire formats
export type {
  ChangeSerializer,
  SerializerRegistry,
  SerializedChange,
  DeserializeOutcome,
  DeserializeResult,
  DeserializeError,
  SerializeOptions
} from './serializers'
export {
  V1Serializer,
  v1Serializer,
  V2Serializer,
  v2Serializer,
  serializerRegistry,
  getSerializer,
  getDefaultSerializer,
  autoDeserialize,
  autoSerialize,
  createSerializerRegistry
} from './serializers'

// Version-specific change handlers
export type {
  ChangeHandler,
  HandlerContext,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  HandlerEvent,
  ProcessResult,
  RegistryStats
} from './handlers/index'
export {
  ChangeHandlerRegistry,
  changeHandlerRegistry,
  createHandler,
  createVersionedHandler,
  createTestContext
} from './handlers/index'

// Data integrity verification
export type {
  IntegrityIssueType,
  RepairActionType,
  RepairAction,
  IntegrityIssue,
  IntegrityReport,
  VerifyOptions
} from './integrity'
export {
  verifyIntegrity,
  quickIntegrityCheck,
  verifySingleChange,
  findOrphans,
  findRoots,
  findHeads,
  getChainDepth,
  attemptRepair,
  formatIntegrityReport
} from './integrity'

// Deprecation system
export type {
  DeprecationType,
  DeprecationNotice,
  DeprecationContext,
  DeprecationWarning,
  DeprecationCallback
} from './deprecation'
export {
  DEPRECATIONS,
  DEPRECATION_POLICY,
  checkDeprecations,
  checkAndLogDeprecations,
  logDeprecation,
  clearLoggedDeprecations,
  configureDeprecationPolicy,
  getDeprecationsByType,
  getDeprecation,
  isDeprecated,
  isRemoved,
  registerDeprecation,
  formatDeprecationReport,
  DeprecationError
} from './deprecation'

// Periodic integrity monitoring
export type {
  IntegrityMonitorConfig,
  IntegrityMonitorStats,
  IntegrityMonitor,
  ReactIntegrityMonitorOptions
} from './integrity-monitor'
export { createIntegrityMonitor, createReactIntegrityMonitor } from './integrity-monitor'

// Security policy for operation-based level selection
export type { SecurityPolicy, OperationType } from './security-policy'
export {
  DEFAULT_SECURITY_POLICY,
  HYBRID_SECURITY_POLICY,
  MAX_SECURITY_POLICY,
  getSecurityLevel,
  isEphemeralOperation,
  isCriticalOperation,
  createSecurityPolicy,
  mergeSecurityPolicies
} from './security-policy'
