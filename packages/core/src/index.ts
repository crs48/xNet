/**
 * @xnetjs/core - Core types, schemas, and content addressing
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

// Permissions (legacy)
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

// Authorization (new encryption-first model)
export type {
  AuthAction,
  AuthDecision,
  AuthDenyReason,
  AuthTrace,
  AuthTraceStep,
  AuthorizationDefinition,
  SerializedAuthorization,
  ActionKey,
  RoleKey,
  SchemaAction,
  AuthExpression,
  SerializedAuthExpression,
  AllowExpr,
  DenyExpr,
  AndExpr,
  OrExpr,
  NotExpr,
  RoleRefExpr,
  PublicExpr,
  AuthenticatedExpr,
  RoleResolver,
  SerializedRoleResolver,
  CreatorRoleResolver,
  PropertyRoleResolver,
  RelationRoleResolver,
  MembershipRoleResolver,
  AuthCheckInput,
  PolicyEvaluator
} from './auth-types'
export { AUTH_ACTIONS } from './auth-types'

// Shared utility helpers (dependency-free)
export { clamp, clamp01, formatBytes } from './utils'

// Retry/backoff policies (exploration 0303)
export { capped, exponential, fixed, jittered, limitAttempts, type RetryPolicy } from './retry'

// Tagged-error convention (exploration 0303)
export { TaggedError, isTagged } from './errors'

// Async utilities (exploration 0303)
export { singleFlight, type SingleFlightOptions } from './async'

// The ONE Last-Write-Wins ordering (protocol §L1.7; exploration 0276/0305)
export {
  LWW_TIEBREAK_KEY_VERSION,
  compareChangeApplicationOrder,
  compareLwwStamps,
  computeLwwTiebreakKey,
  lwwUpdateGuardSql,
  lwwWins,
  type LwwStamp
} from './lww'
export { SsrfError, assertPublicUrl, validateExternalUrl } from './utils'

// Core types
export type DID = `did:key:${string}`
export type DocumentPath = `xnet://${DID}/workspace/${string}/doc/${string}`
