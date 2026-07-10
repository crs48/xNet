/**
 * DevTools event type definitions
 *
 * All events flow through the DevToolsEventBus ring buffer.
 * Instrumentation wrappers emit these from NodeStore, SyncProvider, Y.Doc, etc.
 */

import type { NodeChange, MergeConflict } from '@xnetjs/data'
import type { SyncStatus, PeerInfo } from '@xnetjs/sync'

// ─── Base Event ────────────────────────────────────────────

export interface DevToolsEventBase {
  /** Unique monotonic event ID */
  id: string
  /** performance.now() for ordering */
  timestamp: number
  /** Date.now() for display */
  wallTime: number
}

// ─── Store Events ──────────────────────────────────────────

export interface StoreCreateEvent extends DevToolsEventBase {
  type: 'store:create'
  nodeId: string
  schemaId: string
  properties: Record<string, unknown>
  lamport: number
  duration: number
}

export interface StoreUpdateEvent extends DevToolsEventBase {
  type: 'store:update'
  nodeId: string
  properties: Record<string, unknown>
  lamport: number
  duration: number
}

export interface StoreDeleteEvent extends DevToolsEventBase {
  type: 'store:delete'
  nodeId: string
  duration: number
}

export interface StoreRestoreEvent extends DevToolsEventBase {
  type: 'store:restore'
  nodeId: string
  duration: number
}

export interface StoreTransactionEvent extends DevToolsEventBase {
  type: 'store:transaction'
  operations: Array<{ type: string; nodeId: string }>
  batchId: string
  duration: number
}

export interface StoreRemoteChangeEvent extends DevToolsEventBase {
  type: 'store:remote-change'
  change: NodeChange
  nodeId: string
  peerId?: string
  isRemote: true
}

export interface StoreConflictEvent extends DevToolsEventBase {
  type: 'store:conflict'
  conflict: MergeConflict
}

/**
 * Informational LWW housekeeping: a cross-author write replaced a differing
 * local value (lost update). Distinct from `store:conflict` so routine
 * resolution doesn't render as an error (exploration 0296).
 */
export interface StoreLwwResolutionEvent extends DevToolsEventBase {
  type: 'store:lww-resolution'
  conflict: MergeConflict
}

// ─── Sync Events ───────────────────────────────────────────

export interface SyncStatusEvent extends DevToolsEventBase {
  type: 'sync:status-change'
  room: string
  previousStatus: SyncStatus
  newStatus: SyncStatus
}

export interface SyncPeerConnectedEvent extends DevToolsEventBase {
  type: 'sync:peer-connected'
  peer: PeerInfo
  room: string
  totalPeers: number
}

export interface SyncPeerDisconnectedEvent extends DevToolsEventBase {
  type: 'sync:peer-disconnected'
  peerId: string
  room: string
  totalPeers: number
}

export interface SyncChangeReceivedEvent extends DevToolsEventBase {
  type: 'sync:change-received'
  changeId: string
  peerId: string
  lamport: number
  room: string
}

export interface SyncBroadcastEvent extends DevToolsEventBase {
  type: 'sync:broadcast'
  changeId: string
  lamport: number
  room: string
}

export interface SyncErrorEvent extends DevToolsEventBase {
  type: 'sync:error'
  error: string
  room: string
}

// ─── Yjs Events ────────────────────────────────────────────

export interface YjsUpdateEvent extends DevToolsEventBase {
  type: 'yjs:update'
  docId: string
  updateSize: number
  origin: string | null
  isLocal: boolean
}

export interface YjsMetaChangeEvent extends DevToolsEventBase {
  type: 'yjs:meta-change'
  docId: string
  keysChanged: string[]
  origin: string | null
  isLocal: boolean
}

export interface YjsStateVectorEvent extends DevToolsEventBase {
  type: 'yjs:state-vector'
  docId: string
  entries: Array<{ clientId: number; clock: number }>
  encodedSize: number
}

export interface YjsProviderStatusEvent extends DevToolsEventBase {
  type: 'yjs:provider-status'
  docId: string
  connected: boolean
  peerCount: number
}

// ─── Query Events ──────────────────────────────────────────

export interface QuerySubscribeEvent extends DevToolsEventBase {
  type: 'query:subscribe'
  queryId: string
  schemaId: string
  mode: 'list' | 'single' | 'filtered'
  filter?: Record<string, unknown>
  descriptorKey?: string
  callerInfo?: string
}

export interface QueryUnsubscribeEvent extends DevToolsEventBase {
  type: 'query:unsubscribe'
  queryId: string
}

export interface QueryResultEvent extends DevToolsEventBase {
  type: 'query:result'
  queryId: string
  resultCount: number
  duration: number
  source?: string
  plan?: QueryPlanInfo | null
  materialized?: QueryMaterializedInfo | null
  stream?: QueryStreamInfo | null
}

export interface QueryErrorEvent extends DevToolsEventBase {
  type: 'query:error'
  queryId: string
  error: string
}

export interface QueryStreamTimelineEvent extends DevToolsEventBase {
  type: 'query:stream-event'
  queryId: string
  stream: QueryStreamInfo
  resultCount: number
  source?: string
}

export interface QueryPlanInfo {
  strategy?: string
  candidateNodeCount?: number
  hydratedNodeCount?: number
  returnedNodeCount?: number
  durationMs?: number
  descriptorHash?: string
  candidateAccelerators?: string[]
  materializedViewId?: string
  materializedCacheHit?: boolean
  materializedRefreshReason?: string
}

export interface QueryMaterializedInfo {
  viewId: string
  cacheHit: boolean
  generatedAt: number
  invalidatedAt?: number
  rowCount: number
}

export interface QueryStreamProgressInfo {
  phase: string
  loaded?: number
  total?: number | null
  message?: string
}

export interface QueryStreamInfo {
  status: string
  lastEvent: string
  lastEventAt: number
  progress?: QueryStreamProgressInfo | null
  error?: string | null
  resetReason?: string
}

export interface QueryResultMetadata {
  source?: string
  plan?: QueryPlanInfo | null
  materialized?: QueryMaterializedInfo | null
  stream?: QueryStreamInfo | null
}

export interface MutateStartEvent extends DevToolsEventBase {
  type: 'mutate:start'
  mutationId: string
  operation: 'create' | 'update' | 'delete' | 'restore' | 'transaction'
  nodeId?: string
  schemaId?: string
}

export interface MutateCompleteEvent extends DevToolsEventBase {
  type: 'mutate:complete'
  mutationId: string
  duration: number
  success: boolean
}

export interface MutateErrorEvent extends DevToolsEventBase {
  type: 'mutate:error'
  mutationId: string
  error: string
}

// ─── Telemetry Events ──────────────────────────────────────

export interface TelemetryCrashEvent extends DevToolsEventBase {
  type: 'telemetry:crash'
  errorType: string
  errorMessage: string
  component?: string
}

export interface TelemetryUsageEvent extends DevToolsEventBase {
  type: 'telemetry:usage'
  metric: string
  bucket: string
  period: string
}

export interface TelemetrySecurityEvent extends DevToolsEventBase {
  type: 'telemetry:security'
  eventType: string
  severity: string
  actionTaken: string
}

export interface TelemetryPerformanceEvent extends DevToolsEventBase {
  type: 'telemetry:performance'
  metric: string
  bucket: string
}

export interface TelemetryConsentEvent extends DevToolsEventBase {
  type: 'telemetry:consent-change'
  tier: string
  previousTier: string
}

export interface TelemetryPeerScoresEvent extends DevToolsEventBase {
  type: 'telemetry:peer-scores'
  scores: PeerScoreSnapshot[]
}

export interface PeerScoreSnapshot {
  peerId: string
  score: number
  syncSuccesses: number
  syncFailures: number
  invalidSignatures: number
  rateLimitViolations: number
  lastSeen: number
}

// ─── Tracing Events (exploration 0190) ─────────────────────

/** One stage span within a trace (duck of @xnetjs/telemetry's Span). */
export interface DevToolsTraceSpan {
  spanId: string
  parentSpanId?: string
  name: string
  startOffsetMs: number
  durationMs: number
  attributes?: Record<string, string | number | boolean | undefined>
}

/** A completed operation trace (duck of @xnetjs/telemetry's Trace). */
export interface DevToolsTrace {
  traceId: string
  rootKind: string
  rootName: string
  startedAt: number
  totalMs: number
  spans: DevToolsTraceSpan[]
}

export interface TracingTraceEvent extends DevToolsEventBase {
  type: 'tracing:trace'
  trace: DevToolsTrace
}

// ─── Abuse Events ─────────────────────────────────────────

export interface AbusePolicyDecisionEvent extends DevToolsEventBase {
  type: 'abuse:policy-decision'
  surface: string
  subjectId?: string
  actorDid?: string
  peerId?: string
  peerScore?: number
  scope?: string
  policyId?: string
  admission: string
  visibility: string
  reach: string
  resource: string
  reasons: string[]
  evidenceRefs: string[]
  includeInCounters: boolean
  includeInSearch: boolean
  reviewQueue?: string
  reviewPriority?: number
  labelsToEmit: AbusePendingLabelSnapshot[]
}

export interface AbusePendingLabelSnapshot {
  value: string
  confidence: number
  reason: string
  evidenceRefs: string[]
}

export interface AbuseLabelEvent extends DevToolsEventBase {
  type: 'abuse:label'
  subjectId: string
  value: string
  action: 'proposed' | 'applied' | 'removed' | 'expired'
  confidence: number
  sourceDid?: string
  sourceWeight?: number
  surface?: string
  reason?: string
  evidenceRefs: string[]
  expiresAt?: number
}

export interface AbuseQueueStateEvent extends DevToolsEventBase {
  type: 'abuse:queue-state'
  queues: AbuseQueueSnapshot[]
}

export interface AbuseQueueSnapshot {
  queue: string
  pending: number
  active?: number
  oldestQueuedAt?: number
  highestPriority?: number
  sampleSubjectIds?: string[]
}

export interface AbusePeerScoresEvent extends DevToolsEventBase {
  type: 'abuse:peer-scores'
  scores: PeerScoreSnapshot[]
}

export interface AbuseUsageSummaryEvent extends DevToolsEventBase {
  type: 'abuse:usage-summary'
  summary: AbuseUsageSummarySnapshot
  period?: string
  hubId?: string
  workspaceId?: string
}

export interface AbuseUsageSummarySnapshot {
  totalEvents: number
  totalUnits: number
  kindCounts?: Record<string, number>
  settlementCounts?: Record<string, number>
  unitsByKind?: Record<string, number>
  unitsBySettlement?: Record<string, number>
  eventsBySurface?: Record<string, number>
  eventsByWorkType?: Record<string, number>
  costMicroUsd: number
  billableMicroUsd: number
  sponsoredMicroUsd: number
  reciprocalCreditUnits: number
  blockedUnits: number
  throttledUnits: number
  reviewedUnits: number
  automationSavedUnits: number
  automationSavedCostMicroUsd: number
  appealUnits: number
  appealCostMicroUsd: number
  automationSavingsRatio: number
  reviewLoadRatio: number
  appealLoadRatio: number
}

// ─── Union Type ────────────────────────────────────────────

export type DevToolsEvent =
  | StoreCreateEvent
  | StoreUpdateEvent
  | StoreDeleteEvent
  | StoreRestoreEvent
  | StoreTransactionEvent
  | StoreRemoteChangeEvent
  | StoreConflictEvent
  | StoreLwwResolutionEvent
  | SyncStatusEvent
  | SyncPeerConnectedEvent
  | SyncPeerDisconnectedEvent
  | SyncChangeReceivedEvent
  | SyncBroadcastEvent
  | SyncErrorEvent
  | YjsUpdateEvent
  | YjsMetaChangeEvent
  | YjsStateVectorEvent
  | YjsProviderStatusEvent
  | QuerySubscribeEvent
  | QueryUnsubscribeEvent
  | QueryResultEvent
  | QueryErrorEvent
  | QueryStreamTimelineEvent
  | MutateStartEvent
  | MutateCompleteEvent
  | MutateErrorEvent
  | TelemetryCrashEvent
  | TelemetryUsageEvent
  | TelemetrySecurityEvent
  | TelemetryPerformanceEvent
  | TelemetryConsentEvent
  | TelemetryPeerScoresEvent
  | TracingTraceEvent
  | AbusePolicyDecisionEvent
  | AbuseLabelEvent
  | AbuseQueueStateEvent
  | AbusePeerScoresEvent
  | AbuseUsageSummaryEvent

export type DevToolsEventType = DevToolsEvent['type']

/** Helper to extract event by type */
export type EventOfType<T extends DevToolsEventType> = Extract<DevToolsEvent, { type: T }>

/** Input type for emit() - event without auto-populated fields */
export type DevToolsEventInput = {
  [K in DevToolsEventType]: Omit<
    Extract<DevToolsEvent, { type: K }>,
    'id' | 'timestamp' | 'wallTime'
  >
}[DevToolsEventType]
