/**
 * @xnet/core - Core types, schemas, and content addressing
 */

// Content addressing
export type { ContentId, ContentChunk, MerkleNode, ContentTree, ContentResolver } from './content'
export {
  hashContent,
  createContentId,
  parseContentId,
  verifyContent,
  createChunk,
  buildMerkleTree
} from './hashing'

// Snapshots
export type { SnapshotTriggers, Snapshot, DocumentLoad } from './snapshots'
export { shouldCreateSnapshot, DEFAULT_SNAPSHOT_TRIGGERS, mergeStateVectors } from './snapshots'

// Signed updates
export type { VectorClock, SignedUpdate, Fork, ChainStatus } from './updates'
export {
  compareVectorClocks,
  isValidProgression,
  mergeVectorClocks,
  incrementVectorClock
} from './updates'

// Verification
export type { UpdateVerifier } from './verification'
export { detectFork, verifyUpdateChain } from './verification'

// DID resolution
export type { PeerLocation, DIDResolution, ResolutionStrategy, DIDResolver } from './resolution'
export {
  BOOTSTRAP_PEERS,
  DHT_CONFIG,
  RESOLUTION_CACHE_CONFIG,
  parseDID,
  isValidDID,
  isLocationFresh
} from './resolution'

// Query federation
export type {
  Query,
  DataSource,
  SubQuery,
  QueryPlan,
  QueryRouter,
  QueryRequest,
  QueryResponse,
  StreamingQueryOptions
} from './federation'
export {
  DEFAULT_STREAMING_OPTIONS,
  estimateQueryCost,
  unionAggregate,
  deduplicatedUnion
} from './federation'

// Permissions
export type {
  Group,
  Role,
  Capability,
  PermissionGrant,
  ResourceScope,
  Condition,
  TimeCondition,
  IPCondition,
  PermissionEvaluator
} from './permissions'
export {
  ALL_CAPABILITIES,
  STANDARD_ROLES,
  roleHasCapability,
  evaluateCondition,
  getMostPermissiveCapability
} from './permissions'

// Core types
export type DID = `did:key:${string}`
export type DocumentPath = `xnet://${DID}/workspace/${string}/doc/${string}`
