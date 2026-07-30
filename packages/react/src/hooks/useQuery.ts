/**
 * useQuery - Unified read hook for Nodes via DataBridge
 *
 * A single hook for all read operations:
 * - List all nodes of a schema
 * - Get a single node by ID
 * - Query with filters
 *
 * Returns FlatNode with properties at top level for ergonomic access.
 *
 * Uses DataBridge for off-main-thread data access. The bridge handles
 * caching and provides useSyncExternalStore-compatible subscriptions.
 *
 * @example
 * ```tsx
 * // List all tasks
 * const { data: tasks } = useQuery(TaskSchema)
 * tasks.forEach(task => console.log(task.title))  // Direct access!
 *
 * // Get single task by ID
 * const { data: task } = useQuery(TaskSchema, taskId)
 * console.log(task?.status)  // Typed correctly!
 *
 * // Query with filters
 * const { data: urgent } = useQuery(TaskSchema, {
 *   where: { status: 'urgent' },
 *   orderBy: { createdAt: 'desc' }
 * })
 * ```
 */
import type { DefinedSchema, PropertyBuilder, InferCreateProps, NodeState } from '@xnetjs/data'
import type {
  QueryDescriptor,
  QueryExecutionMode,
  QueryCompletenessMetadata,
  QueryMaterializedMetadata,
  QueryMaterializedViewOptions,
  QueryMetadata,
  QueryOptions,
  QueryPageInfo,
  QueryPageOptions,
  QuerySearchFilter,
  QuerySource,
  QuerySourcePreference,
  QuerySpatialFilter,
  QueryStreamMetadata,
  QueryStalenessMetadata,
  QueryVerificationMetadata
} from '@xnetjs/data-bridge'
import {
  createQueryDescriptor,
  queryDescriptorToOptions,
  serializeQueryDescriptor
} from '@xnetjs/data-bridge'
import { useSyncExternalStore, useMemo, useCallback, useEffect, useRef } from 'react'
import { useDataBridge } from '../context'
import { useTelemetryReporter } from '../context/telemetry-context'
import { useTracingReporter, TRACE_STAGES, type TracingHandle } from '../context/tracing-context'
import { useInstrumentation } from '../instrumentation'
import { flattenNode, type FlatNode } from '../utils/flattenNode'
import {
  computeFallbackPageInfo,
  summarizePlan,
  type QueryPlanSummary
} from '../utils/queryResultMeta'

// =============================================================================
// Types
// =============================================================================

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc'

/**
 * System fields that can be used for ordering
 */
export type SystemOrderField = 'createdAt' | 'updatedAt'

/**
 * Query filter options
 */
export interface QueryFilter<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  /** Filter conditions (property: value) */
  where?: Partial<InferCreateProps<P>>
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
  /** Sort by property or system field (createdAt, updatedAt) */
  orderBy?: { [K in keyof InferCreateProps<P> | SystemOrderField]?: SortDirection }
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Recommended pagination option. `page.first` maps to the current bounded read limit. */
  page?: QueryPageOptions
  /** Spatial filtering for viewport windows or radius-based 2D queries */
  spatial?: QuerySpatialFilter
  /** Tokenized full-text search over searchable node fields */
  search?: string | QuerySearchFilter
  /** Stable view cache key for storage-backed materialized result sets */
  materializedView?: string | QueryMaterializedViewOptions
  /** Future execution mode hint. Current runtimes execute locally. */
  mode?: QueryExecutionMode
  /** Future source preference hint for hub or federated reads. */
  source?: QuerySourcePreference
  /** Disable bridge subscription while preserving a typed empty result. */
  enabled?: boolean
}

export type QueryStatus = 'loading' | 'success' | 'error'

export type { QueryPlanSummary } from '../utils/queryResultMeta'

export interface QueryBaseResult {
  /** Query lifecycle status */
  status: QueryStatus
  /** Whether currently loading */
  loading: boolean
  /** Alias for loading */
  isLoading: boolean
  /** Whether a fetch/reload is currently active */
  isFetching: boolean
  /** Whether the query is backed by a live subscription */
  isLive: boolean
  /** Source that produced the current snapshot */
  source: QuerySource
  /** Any error that occurred */
  error: Error | null
  /** Reload the query */
  reload: () => void
  /** Optional bridge/runtime plan summary */
  plan: QueryPlanSummary | null
  /** Optional materialized view metadata */
  materialized: QueryMaterializedMetadata | null
  /** Remote/federated completeness metadata when available */
  completeness: QueryCompletenessMetadata | null
  /** Remote/federated staleness metadata when available */
  staleness: QueryStalenessMetadata | null
  /** Remote/federated verification metadata when available */
  verification: QueryVerificationMetadata | null
  /** Streaming lifecycle metadata when a live or stream query is active */
  stream: QueryStreamMetadata | null
}

/**
 * Migration warning info
 */
export interface MigrationWarning {
  /** The node ID that was migrated */
  nodeId: string
  /** The original schema IRI */
  from: string
  /** The target schema IRI */
  to: string
  /** Warning messages about potential data loss */
  warnings: string[]
}

/**
 * Result when querying a list of nodes
 */
export interface QueryListResult<
  P extends Record<string, PropertyBuilder>
> extends QueryBaseResult {
  /** The queried nodes (flattened - access properties directly) */
  data: FlatNode<P>[]
  /** Pagination and count metadata */
  pageInfo: QueryPageInfo
  /** Total matching count when known. Null means unavailable or intentionally not counted. */
  totalCount: number | null
  /** Whether more results may be available. Exact when totalCount is known. */
  hasMore: boolean
  /**
   * Migration warnings for nodes that were migrated from different schema versions.
   * Only populated if nodes required migration and the migration was lossy.
   */
  migrationWarnings: MigrationWarning[]
}

/**
 * Result when querying a single node
 */
export interface QuerySingleResult<
  P extends Record<string, PropertyBuilder>
> extends QueryBaseResult {
  /** The queried node (flattened - access properties directly), null if not found */
  data: FlatNode<P> | null
  /**
   * Migration warnings if the node was migrated from a different schema version.
   * Only populated if the node required migration and the migration was lossy.
   */
  migrationWarnings: MigrationWarning[]
}

const EMPTY_QUERY_FILTER: QueryFilter = Object.freeze({})
const DISABLED_QUERY_SNAPSHOT: never[] = []

/**
 * Monotonic per-instance counter for devtools query ids. Cheaper and more
 * deterministic than `Math.random()` and only consumed once per hook mount.
 */
let nextQueryInstanceId = 0

/**
 * Global flatten cache: a NodeState reference always flattens to the same
 * FlatNode reference. The bridge preserves NodeState identities for
 * unchanged rows, so memoized children keyed on FlatNode identity skip
 * re-rendering when their row did not change. Only valid for the
 * options-less flatten that useQuery performs.
 */
const flatNodeCache = new WeakMap<NodeState, FlatNode<never>>()

function flattenNodeCached<P extends Record<string, PropertyBuilder>>(
  node: NodeState
): FlatNode<P> {
  const cached = flatNodeCache.get(node)
  if (cached) return cached as FlatNode<P>

  const flat = flattenNode<P>(node)
  flatNodeCache.set(node, flat as FlatNode<never>)
  return flat
}

/**
 * Dev-only guard against the "unbounded + property-sorted" antipattern: a query
 * with no `limit`/`offset`/`after` that orders by a non-system property cannot
 * be pushed to SQL, so it full-scans and JS-sorts the whole schema — fine for a
 * tiny schema, a latent O(n) startup stall once that schema grows (0184).
 * Warns once per (schema, orderBy) shape; compiled out of production builds.
 */
const SYSTEM_ORDER_FIELDS = new Set(['createdAt', 'updatedAt'])
const warnedUnboundedSorts = new Set<string>()

function isProductionEnv(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
}

/** A list read with no limit/offset/cursor — every matching row is returned. */
function isUnboundedListQuery(descriptor: QueryDescriptor): boolean {
  if (descriptor.nodeId) return false
  if (descriptor.limit !== undefined) return false
  if (descriptor.after !== undefined) return false
  return !descriptor.offset
}

/** Order-by keys that are properties (not indexable system fields). */
function propertyOrderKeys(descriptor: QueryDescriptor): string[] {
  return Object.keys(descriptor.orderBy ?? {}).filter((key) => !SYSTEM_ORDER_FIELDS.has(key))
}

/** Once-per-shape dedup key when a query is unbounded AND property-sorted; else null. */
function unboundedPropertySortKey(schemaId: string, descriptor: QueryDescriptor): string | null {
  if (isProductionEnv()) return null
  if (!isUnboundedListQuery(descriptor)) return null
  const propertyKeys = propertyOrderKeys(descriptor)
  return propertyKeys.length > 0 ? `${schemaId}:${propertyKeys.join(',')}` : null
}

/**
 * Dev-only guard against the "unbounded + property-sorted" antipattern: a query
 * with no `limit`/`offset`/`after` that orders by a non-system property cannot
 * be pushed to SQL, so it full-scans and JS-sorts the whole schema — fine for a
 * tiny schema, a latent O(n) startup stall once that schema grows (0184).
 * Warns once per (schema, orderBy) shape; compiled out of production builds.
 */
function warnIfUnboundedPropertySort(schemaId: string, descriptor: QueryDescriptor): void {
  const warnKey = unboundedPropertySortKey(schemaId, descriptor)
  if (warnKey === null) return
  if (warnedUnboundedSorts.has(warnKey)) return
  warnedUnboundedSorts.add(warnKey)
  console.warn(
    `[useQuery] Unbounded query on "${schemaId}" ordered by property ` +
      `${JSON.stringify(propertyOrderKeys(descriptor))} cannot use an index — it full-scans and ` +
      `JS-sorts the whole schema. Add a \`limit\` and order by a system field ` +
      `(createdAt/updatedAt), then sort in JS if needed (exploration 0184).`
  )
}

function getFallbackPageInfo(input: {
  metadata: QueryMetadata | null
  loading: boolean
  isSingleQuery: boolean
  data: unknown
  descriptor: QueryDescriptor
}): QueryPageInfo {
  return computeFallbackPageInfo({
    metadata: input.metadata,
    loading: input.loading,
    loadedCount: !input.isSingleQuery && Array.isArray(input.data) ? input.data.length : null,
    offset: input.descriptor.offset ?? 0,
    limit: input.descriptor.limit
  })
}

/**
 * Flatten one bridge snapshot into FlatNodes plus lossy-migration warnings.
 * Module-level so the hook body stays small; identity caching comes from
 * flattenNodeCached.
 */
function flattenListSnapshot<P extends Record<string, PropertyBuilder>>(
  rawData: NodeState[]
): { data: FlatNode<P>[]; migrationWarnings: MigrationWarning[] } {
  const data = rawData.map((node) => flattenNodeCached<P>(node))
  return { data, migrationWarnings: collectMigrationWarnings(data) }
}

/** Null-normalized metadata surfaces exposed on every query result. */
function deriveMetadataSurfaces(metadata: QueryMetadata | null): {
  source: QuerySource
  materialized: QueryMaterializedMetadata | null
  completeness: QueryCompletenessMetadata | null
  staleness: QueryStalenessMetadata | null
  verification: QueryVerificationMetadata | null
  stream: QueryStreamMetadata | null
} {
  return {
    source: metadata?.source ?? 'local',
    materialized: metadata?.materialized ?? null,
    completeness: metadata?.completeness ?? null,
    staleness: metadata?.staleness ?? null,
    verification: metadata?.verification ?? null,
    stream: metadata?.stream ?? null
  }
}

function deriveTrackedFilter(descriptor: QueryDescriptor): Record<string, unknown> | undefined {
  const next = {
    ...(descriptor.where ? { where: descriptor.where } : {}),
    ...(descriptor.spatial ? { spatial: descriptor.spatial } : {}),
    ...(descriptor.search ? { search: descriptor.search } : {}),
    ...(descriptor.materializedView ? { materializedView: descriptor.materializedView } : {})
  }

  return Object.keys(next).length > 0 ? next : undefined
}

function deriveTrackedMode(
  isSingleQuery: boolean,
  descriptor: QueryDescriptor
): 'single' | 'filtered' | 'list' {
  if (isSingleQuery) return 'single'
  return descriptor.where || descriptor.spatial || descriptor.search ? 'filtered' : 'list'
}

function collectMigrationWarnings(
  flattened: ReadonlyArray<FlatNode<never> | FlatNode<Record<string, PropertyBuilder>>>
): MigrationWarning[] {
  const warnings: MigrationWarning[] = []
  for (const flat of flattened) {
    if (flat._migrationInfo && !flat._migrationInfo.lossless) {
      warnings.push({
        nodeId: flat.id,
        from: flat._migrationInfo.from,
        to: flat._migrationInfo.to,
        warnings: flat._migrationInfo.warnings
      })
    }
  }
  return warnings
}

// =============================================================================
// Hook Overloads
// =============================================================================

/**
 * Query all nodes of a schema
 *
 * @public
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>
): QueryListResult<P>

/**
 * Query a single node by ID
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  id: string
): QuerySingleResult<P>

/**
 * Query nodes with filters
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  filter: QueryFilter<P>
): QueryListResult<P>

/**
 * Query nodes - implementation
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  idOrFilter?: string | QueryFilter<P>
): QueryListResult<P> | QuerySingleResult<P> {
  const bridge = useDataBridge()
  const instrumentation = useInstrumentation()
  const telemetry = useTelemetryReporter()
  const tracing = useTracingReporter()
  const schemaId = schema._schemaId
  // Track query start time for first-load timing. Lazily initialized so we
  // don't evaluate Date.now() on every render of every mounted useQuery.
  const queryStartRef = useRef<number | null>(null)
  if (queryStartRef.current === null) queryStartRef.current = Date.now()

  // Determine query mode
  const isSingleQuery = typeof idOrFilter === 'string'
  const filter: QueryFilter<P> =
    typeof idOrFilter === 'object' ? idOrFilter : (EMPTY_QUERY_FILTER as QueryFilter<P>)
  const nodeId = isSingleQuery ? idOrFilter : null
  const enabled = filter.enabled ?? true

  // Create a canonical descriptor for stable cache keys and reload semantics.
  // Callers overwhelmingly pass inline filter literals, so the filter's
  // object identity churns every render. Building + serializing costs ~1 µs;
  // the important part is reusing the PREVIOUS descriptor object whenever the
  // canonical key is unchanged so downstream memos and callbacks stay stable.
  // Skip the rebuild + serialize entirely when the caller's input is
  // referentially stable (the no-arg list, single-by-id, and memoized-filter
  // cases). Inline filter literals still churn identity every render, so for
  // those we rebuild + serialize but reuse the PREVIOUS descriptor object
  // whenever the canonical key is unchanged, keeping downstream memos stable.
  const descriptorRef = useRef<{
    input: string | QueryFilter<P> | undefined
    schemaId: string
    key: string
    descriptor: QueryDescriptor
  } | null>(null)
  if (
    !descriptorRef.current ||
    descriptorRef.current.input !== idOrFilter ||
    descriptorRef.current.schemaId !== schemaId
  ) {
    const options: QueryOptions<P> = isSingleQuery && nodeId ? { nodeId } : filter
    const candidate = createQueryDescriptor(schemaId, options)
    const candidateKey = serializeQueryDescriptor(candidate)
    const descriptor =
      descriptorRef.current && descriptorRef.current.key === candidateKey
        ? descriptorRef.current.descriptor
        : candidate
    descriptorRef.current = { input: idOrFilter, schemaId, key: candidateKey, descriptor }
    warnIfUnboundedPropertySort(schemaId, descriptor)
  }
  const descriptor = descriptorRef.current.descriptor
  const queryKey = descriptorRef.current.key

  // Create subscription via DataBridge (memoized by schema + options)
  // When bridge is null (initializing), use a dummy subscription that returns loading state
  const subscription = useMemo(() => {
    if (!enabled) {
      return {
        getSnapshot: () => DISABLED_QUERY_SNAPSHOT,
        getMetadata: () => null,
        subscribe: () => () => {}
      }
    }

    if (!bridge) {
      // Return a dummy subscription while bridge is initializing
      return {
        getSnapshot: () => null,
        getMetadata: () => null,
        subscribe: () => () => {}
      }
    }
    return bridge.query(schema, queryDescriptorToOptions<P>(descriptor))
  }, [bridge, enabled, schema, queryKey]) // eslint-disable-line react-hooks/exhaustive-deps -- queryKey is the canonical descriptor identity

  // Reload function - delegates to the bridge for the active canonical descriptor.
  const reload = useCallback(() => {
    if (!enabled || !bridge?.reloadQuery) return
    void bridge.reloadQuery(descriptor)
  }, [bridge, descriptor, enabled])

  // Use React's useSyncExternalStore for concurrent-safe subscriptions.
  // Data and metadata are folded into one versioned snapshot: a
  // metadata-only update (same data identity) still produces a new snapshot
  // object, so React cannot bail out and silently drop it.
  const combinedSnapshotRef = useRef<{
    data: NodeState[] | null
    metadata: QueryMetadata | null
  } | null>(null)
  const getCombinedSnapshot = useCallback(() => {
    const data = subscription.getSnapshot()
    const metadata = subscription.getMetadata?.() ?? null
    const previous = combinedSnapshotRef.current
    if (previous && previous.data === data && previous.metadata === metadata) {
      return previous
    }
    const next = { data, metadata }
    combinedSnapshotRef.current = next
    return next
  }, [subscription])
  const combinedSnapshot = useSyncExternalStore(
    subscription.subscribe,
    getCombinedSnapshot,
    getCombinedSnapshot // Server snapshot (same as client for now)
  )
  const rawData = combinedSnapshot.data
  const metadata = combinedSnapshot.metadata

  // Transform raw NodeState[] to FlatNode[]. Flattening goes through a
  // WeakMap keyed by NodeState identity, and the produced array is replaced
  // by the previous one when every element kept its identity — so metadata-
  // only snapshots and no-op reloads do not invalidate `data` for consumers.
  const previousListRef = useRef<{
    data: FlatNode<P>[]
    migrationWarnings: MigrationWarning[]
  } | null>(null)
  const { data, migrationWarnings } = useMemo(() => {
    if (rawData === null) {
      // Loading state
      return {
        data: isSingleQuery ? null : [],
        migrationWarnings: []
      }
    }

    if (isSingleQuery) {
      // Single node query
      const node = rawData[0] ?? null
      const flat = node ? flattenNodeCached<P>(node) : null
      return {
        data: flat as FlatNode<P> | null,
        migrationWarnings: flat ? collectMigrationWarnings([flat]) : []
      }
    }

    // List query
    const next = flattenListSnapshot<P>(rawData)
    const previous = previousListRef.current
    if (
      previous &&
      previous.data.length === next.data.length &&
      next.data.every((flat, index) => flat === previous.data[index])
    ) {
      return previous
    }

    previousListRef.current = next
    return next
  }, [rawData, isSingleQuery])

  // Loading state: rawData is null
  const loading = rawData === null
  const pageInfo = useMemo(
    () => getFallbackPageInfo({ metadata, loading, isSingleQuery, data, descriptor }),
    [metadata, loading, isSingleQuery, data, descriptor]
  )
  const error = useMemo(
    () => (metadata?.error ? new Error(metadata.error) : null),
    [metadata?.error]
  )
  const status: QueryStatus = error ? 'error' : loading ? 'loading' : 'success'
  const plan = useMemo(() => summarizePlan(metadata), [metadata])
  const { source, materialized, completeness, staleness, verification, stream } =
    deriveMetadataSurfaces(metadata)
  const trackedFilter = useMemo(
    () => deriveTrackedFilter(descriptor),
    // queryKey is the canonical descriptor identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey]
  )
  const trackedMode = useMemo(
    () => deriveTrackedMode(isSingleQuery, descriptor),
    // queryKey is the canonical descriptor identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSingleQuery, queryKey]
  )

  // Query tracking for devtools. Lazily initialized with a monotonic counter
  // so we don't build a random string on every render of every useQuery.
  const queryIdRef = useRef<string | null>(null)
  if (queryIdRef.current === null) {
    queryIdRef.current = `useQuery-${schemaId}-${nodeId || 'list'}-${(nextQueryInstanceId++).toString(36)}`
  }
  useEffect(() => {
    if (!instrumentation?.queryTracker) return
    const queryId = queryIdRef.current!
    instrumentation.queryTracker.register(queryId, {
      type: 'useQuery',
      schemaId,
      mode: trackedMode,
      filter: trackedFilter,
      descriptorKey: queryKey,
      nodeId: nodeId || undefined
    })
    return () => {
      instrumentation.queryTracker.unregister(queryId)
    }
  }, [instrumentation, schemaId, nodeId, trackedMode, trackedFilter, queryKey])

  // Report updates to devtools
  useEffect(() => {
    if (!instrumentation?.queryTracker || loading) return
    const count = isSingleQuery ? (data ? 1 : 0) : Array.isArray(data) ? data.length : 0
    instrumentation.queryTracker.recordUpdate(queryIdRef.current!, count, 0, {
      source,
      plan,
      materialized,
      completeness,
      staleness,
      verification,
      stream
    })
  }, [
    data,
    instrumentation,
    isSingleQuery,
    loading,
    source,
    plan,
    materialized,
    completeness,
    staleness,
    verification,
    stream
  ])

  const lastRecordedStreamEventAtRef = useRef(0)
  useEffect(() => {
    if (!instrumentation?.queryTracker.recordStreamEvent || !stream) return
    if (lastRecordedStreamEventAtRef.current === stream.lastEventAt) return

    lastRecordedStreamEventAtRef.current = stream.lastEventAt
    const count = isSingleQuery ? (data ? 1 : 0) : Array.isArray(data) ? data.length : 0
    instrumentation.queryTracker.recordStreamEvent(queryIdRef.current!, stream, count, {
      source
    })
  }, [data, instrumentation, isSingleQuery, source, stream])

  // ─── Telemetry: Subscription churn (mount/unmount tracking) ───────────────
  useEffect(() => {
    if (!telemetry) return
    telemetry.reportUsage('react.useQuery', 1)
    return () => {
      telemetry.reportUsage('react.useQuery.unmount', 1)
    }
  }, [telemetry]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Telemetry: Query timing (first-load latency) ─────────────────────────
  const hasReportedTimingRef = useRef(false)
  // ─── Tracing: a per-query trace spanning first load (exploration 0190) ────
  // Opened on each query key, closed when the first results land. Worker-side
  // stage spans (sqlite/hydrate/auth) attach by traceId in a later phase.
  const queryTraceRef = useRef<TracingHandle | null>(null)
  useEffect(() => {
    queryStartRef.current = Date.now()
    hasReportedTimingRef.current = false
    queryTraceRef.current?.end()
    queryTraceRef.current = tracing?.startTrace('query', `query:${schemaId}`) ?? null
    return () => {
      queryTraceRef.current?.end()
      queryTraceRef.current = null
    }
  }, [queryKey, tracing, schemaId])

  useEffect(() => {
    if (loading || hasReportedTimingRef.current) return
    hasReportedTimingRef.current = true
    const elapsed = Date.now() - (queryStartRef.current ?? Date.now())
    if (telemetry) {
      telemetry.reportPerformance('react.useQuery', elapsed)
      // Cache hit: data immediately available (< 5ms means it was cached)
      if (elapsed < 5) {
        telemetry.reportUsage('react.useQuery.cache_hit', 1)
      } else {
        telemetry.reportUsage('react.useQuery.cache_miss', 1)
      }
    }
    // Close the trace, recording a commit span with the row count for egress.
    const trace = queryTraceRef.current
    if (trace) {
      const rows = isSingleQuery ? (data ? 1 : 0) : Array.isArray(data) ? data.length : 0
      trace.addSpan({
        name: TRACE_STAGES.queryCommit,
        startOffsetMs: 0,
        durationMs: elapsed,
        attributes: { returnedRows: rows }
      })
      trace.end()
      queryTraceRef.current = null
    }
  }, [loading, telemetry, data, isSingleQuery])

  return {
    data,
    status,
    loading,
    isLoading: loading,
    isFetching: loading,
    isLive: bridge !== null,
    source,
    error,
    reload,
    migrationWarnings,
    pageInfo,
    totalCount: pageInfo.totalCount,
    hasMore: pageInfo.hasMore,
    plan,
    materialized,
    completeness,
    staleness,
    verification,
    stream
  } as QueryListResult<P> | QuerySingleResult<P>
}

// =============================================================================
// Re-export FlatNode for convenience
// =============================================================================

export { type FlatNode } from '../utils/flattenNode'
