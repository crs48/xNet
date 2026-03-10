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
import type { QueryOptions, QuerySpatialFilter } from '@xnetjs/data-bridge'
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
  /** Spatial filtering for viewport windows or radius-based 2D queries */
  spatial?: QuerySpatialFilter
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
export interface QueryListResult<P extends Record<string, PropertyBuilder>> {
  /** The queried nodes (flattened - access properties directly) */
  data: FlatNode<P>[]
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the query */
  reload: () => void
  /**
   * Migration warnings for nodes that were migrated from different schema versions.
   * Only populated if nodes required migration and the migration was lossy.
   */
  migrationWarnings: MigrationWarning[]
}

/**
 * Result when querying a single node
 */
export interface QuerySingleResult<P extends Record<string, PropertyBuilder>> {
  /** The queried node (flattened - access properties directly), null if not found */
  data: FlatNode<P> | null
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the query */
  reload: () => void
  /**
   * Migration warnings if the node was migrated from a different schema version.
   * Only populated if the node required migration and the migration was lossy.
   */
  migrationWarnings: MigrationWarning[]
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
  const filter: QueryFilter<P> = typeof idOrFilter === 'object' ? idOrFilter : {}
  const nodeId = isSingleQuery ? idOrFilter : null

  // Memoize stringified where/orderBy for stable dependency comparison
  const whereKey = useMemo(() => JSON.stringify(filter.where), [filter.where])
  const orderByKey = useMemo(() => JSON.stringify(filter.orderBy), [filter.orderBy])
  const spatialKey = useMemo(() => JSON.stringify(filter.spatial), [filter.spatial])

  // Create a canonical descriptor for stable cache keys and reload semantics.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- whereKey/orderByKey are stable string representations
  const descriptor = useMemo(() => {
    const options: QueryOptions<P> = isSingleQuery && nodeId ? { nodeId } : filter
    return createQueryDescriptor(schemaId, options)
  }, [
    schemaId,
    isSingleQuery,
    nodeId,
    whereKey,
    filter.includeDeleted,
    orderByKey,
    filter.limit,
    filter.offset,
    spatialKey
  ])
  const queryKey = useMemo(() => serializeQueryDescriptor(descriptor), [descriptor])

  // Create subscription via DataBridge (memoized by schema + options)
  // When bridge is null (initializing), use a dummy subscription that returns loading state
  const subscription = useMemo(() => {
    if (!bridge) {
      // Return a dummy subscription while bridge is initializing
      return {
        getSnapshot: () => null,
        subscribe: () => () => {}
      }
    }
    return bridge.query(schema, queryDescriptorToOptions<P>(descriptor))
  }, [bridge, schema, descriptor, queryKey])

  // Reload function - delegates to the bridge for the active canonical descriptor.
  const reload = useCallback(() => {
    if (!bridge?.reloadQuery) return
    void bridge.reloadQuery(descriptor)
  }, [bridge, descriptor])

  // Use React's useSyncExternalStore for concurrent-safe subscriptions
  const rawData = useSyncExternalStore(
    subscription.subscribe,
    subscription.getSnapshot,
    subscription.getSnapshot // Server snapshot (same as client for now)
  )

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

  // Query tracking for devtools
  const queryIdRef = useRef(
    `useQuery-${schemaId}-${nodeId || 'list'}-${Math.random().toString(36).slice(2, 8)}`
  )
  useEffect(() => {
    if (!instrumentation?.queryTracker) return
    const mode = isSingleQuery ? 'single' : filter.where || filter.spatial ? 'filtered' : 'list'
    const queryId = queryIdRef.current
    instrumentation.queryTracker.register(queryId, {
      type: 'useQuery',
      schemaId,
      mode,
      filter:
        filter.where || filter.spatial
          ? {
              ...(filter.where ? { where: filter.where } : {}),
              ...(filter.spatial ? { spatial: filter.spatial } : {})
            }
          : undefined,
      descriptorKey: queryKey,
      nodeId: nodeId || undefined
    })
    return () => {
      instrumentation.queryTracker.unregister(queryId)
    }
  }, [instrumentation, schemaId, isSingleQuery, nodeId, filter.where, filter.spatial, queryKey])

  // Report updates to devtools
  useEffect(() => {
    if (!instrumentation?.queryTracker || loading) return
    const count = isSingleQuery ? (data ? 1 : 0) : Array.isArray(data) ? data.length : 0
    instrumentation.queryTracker.recordUpdate(queryIdRef.current, count, 0)
  }, [data, instrumentation, isSingleQuery, loading])

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
    loading,
    error: null, // Errors are handled by the bridge
    reload,
    migrationWarnings
  } as QueryListResult<P> | QuerySingleResult<P>
}

// =============================================================================
// Re-export FlatNode for convenience
// =============================================================================

export { type FlatNode } from '../utils/flattenNode'
