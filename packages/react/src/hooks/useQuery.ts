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
import type { DefinedSchema, PropertyBuilder, InferCreateProps } from '@xnetjs/data'
import type {
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
import { useInstrumentation } from '../instrumentation'
import { flattenNode, flattenNodes, type FlatNode } from '../utils/flattenNode'

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

export interface QueryPlanSummary {
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

const EMPTY_PAGE_INFO: QueryPageInfo = {
  totalCount: null,
  countMode: 'none',
  hasMore: false,
  hasNextPage: false,
  hasPreviousPage: false,
  loadedCount: 0
}
const EMPTY_QUERY_FILTER: QueryFilter = Object.freeze({})
const DISABLED_QUERY_SNAPSHOT: never[] = []

function getFallbackPageInfo(input: {
  metadata: QueryMetadata | null
  loading: boolean
  isSingleQuery: boolean
  data: unknown
  filter: QueryFilter
}): QueryPageInfo {
  if (input.metadata?.pageInfo) {
    return input.metadata.pageInfo
  }

  if (input.loading || input.isSingleQuery || !Array.isArray(input.data)) {
    return EMPTY_PAGE_INFO
  }

  const loadedCount = input.data.length
  const offset = input.filter.offset ?? 0
  const limit = input.filter.limit ?? input.filter.page?.first
  const totalCount = limit === undefined && offset === 0 ? loadedCount : null
  const countMode = totalCount === null ? 'none' : 'exact'
  const hasMore =
    limit !== undefined
      ? totalCount === null
        ? loadedCount >= limit
        : offset + loadedCount < totalCount
      : false

  return {
    totalCount,
    countMode,
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage: offset > 0,
    loadedCount
  }
}

function summarizePlan(metadata: QueryMetadata | null): QueryPlanSummary | null {
  const plan = metadata?.plan
  if (!plan) return null

  return {
    strategy: plan.strategy,
    candidateNodeCount: plan.candidateNodeCount,
    hydratedNodeCount: plan.hydratedNodeCount,
    returnedNodeCount: plan.returnedNodeCount,
    durationMs: plan.durationMs,
    descriptorHash: plan.descriptorHash,
    candidateAccelerators: plan.candidateAccelerators,
    materializedViewId: plan.materializedViewId,
    materializedCacheHit: plan.materializedCacheHit,
    materializedRefreshReason: plan.materializedRefreshReason
  }
}

// =============================================================================
// Hook Overloads
// =============================================================================

/**
 * Query all nodes of a schema
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
  const schemaId = schema._schemaId
  // Track query start time for first-load timing
  const queryStartRef = useRef<number>(Date.now())

  // Determine query mode
  const isSingleQuery = typeof idOrFilter === 'string'
  const filter: QueryFilter<P> =
    typeof idOrFilter === 'object' ? idOrFilter : (EMPTY_QUERY_FILTER as QueryFilter<P>)
  const nodeId = isSingleQuery ? idOrFilter : null
  const enabled = filter.enabled ?? true

  // Create a canonical descriptor for stable cache keys and reload semantics.
  const descriptor = useMemo(() => {
    const options: QueryOptions<P> = isSingleQuery && nodeId ? { nodeId } : filter
    return createQueryDescriptor(schemaId, options)
  }, [schemaId, isSingleQuery, nodeId, filter])
  const queryKey = useMemo(() => serializeQueryDescriptor(descriptor), [descriptor])

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

  // Use React's useSyncExternalStore for concurrent-safe subscriptions
  const rawData = useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot // Server snapshot (same as client for now)
  )
  const metadata = subscription.getMetadata?.() ?? null

  // Transform raw NodeState[] to FlatNode[]
  const { data, migrationWarnings } = useMemo(() => {
    if (rawData === null) {
      // Loading state
      return {
        data: isSingleQuery ? null : [],
        migrationWarnings: []
      }
    }

    const warnings: MigrationWarning[] = []

    if (isSingleQuery) {
      // Single node query
      const node = rawData[0] ?? null
      if (node) {
        const flat = flattenNode<P>(node)
        if (flat._migrationInfo && !flat._migrationInfo.lossless) {
          warnings.push({
            nodeId: flat.id,
            from: flat._migrationInfo.from,
            to: flat._migrationInfo.to,
            warnings: flat._migrationInfo.warnings
          })
        }
        return { data: flat as FlatNode<P> | null, migrationWarnings: warnings }
      }
      return { data: null, migrationWarnings: warnings }
    }

    // List query
    const flattened = flattenNodes<P>(rawData)

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

    return { data: flattened, migrationWarnings: warnings }
  }, [rawData, isSingleQuery])

  // Loading state: rawData is null
  const loading = rawData === null
  const pageInfo = useMemo(
    () => getFallbackPageInfo({ metadata, loading, isSingleQuery, data, filter }),
    [metadata, loading, isSingleQuery, data, filter]
  )
  const error = useMemo(
    () => (metadata?.error ? new Error(metadata.error) : null),
    [metadata?.error]
  )
  const status: QueryStatus = error ? 'error' : loading ? 'loading' : 'success'
  const source = metadata?.source ?? 'local'
  const plan = useMemo(() => summarizePlan(metadata), [metadata])
  const materialized = metadata?.materialized ?? null
  const completeness = metadata?.completeness ?? null
  const staleness = metadata?.staleness ?? null
  const verification = metadata?.verification ?? null
  const stream = metadata?.stream ?? null
  const trackedFilter = useMemo(
    () => {
      const next = {
        ...(descriptor.where ? { where: descriptor.where } : {}),
        ...(descriptor.spatial ? { spatial: descriptor.spatial } : {}),
        ...(descriptor.search ? { search: descriptor.search } : {}),
        ...(descriptor.materializedView ? { materializedView: descriptor.materializedView } : {})
      }

      return Object.keys(next).length > 0 ? next : undefined
    },
    // queryKey is the canonical descriptor identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey]
  )
  const trackedMode = useMemo(
    () =>
      isSingleQuery
        ? 'single'
        : descriptor.where || descriptor.spatial || descriptor.search
          ? 'filtered'
          : 'list',
    // queryKey is the canonical descriptor identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSingleQuery, queryKey]
  )

  // Query tracking for devtools
  const queryIdRef = useRef(
    `useQuery-${schemaId}-${nodeId || 'list'}-${Math.random().toString(36).slice(2, 8)}`
  )
  useEffect(() => {
    if (!instrumentation?.queryTracker) return
    const queryId = queryIdRef.current
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
    instrumentation.queryTracker.recordUpdate(queryIdRef.current, count, 0, {
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
    instrumentation.queryTracker.recordStreamEvent(queryIdRef.current, stream, count, {
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
  useEffect(() => {
    queryStartRef.current = Date.now()
    hasReportedTimingRef.current = false
  }, [queryKey])

  useEffect(() => {
    if (!telemetry || loading || hasReportedTimingRef.current) return
    hasReportedTimingRef.current = true
    const elapsed = Date.now() - queryStartRef.current
    telemetry.reportPerformance('react.useQuery', elapsed)
    // Cache hit: data immediately available (< 5ms means it was cached)
    if (elapsed < 5) {
      telemetry.reportUsage('react.useQuery.cache_hit', 1)
    } else {
      telemetry.reportUsage('react.useQuery.cache_miss', 1)
    }
  }, [loading, telemetry])

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
