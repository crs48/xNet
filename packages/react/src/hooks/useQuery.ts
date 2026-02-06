/**
 * useQuery - Unified read hook for Nodes
 *
 * A single hook for all read operations:
 * - List all nodes of a schema
 * - Get a single node by ID
 * - Query with filters
 *
 * Returns FlatNode with properties at top level for ergonomic access.
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
import type { DefinedSchema, PropertyBuilder, InferCreateProps, NodeChangeEvent } from '@xnet/data'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useInstrumentation } from '../instrumentation'
import { flattenNode, flattenNodes, type FlatNode } from '../utils/flattenNode'
import { useNodeStore } from './useNodeStore'

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
  reload: () => Promise<void>
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
  reload: () => Promise<void>
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
  const { store, isReady } = useNodeStore()
  const instrumentation = useInstrumentation()
  const schemaId = schema._schemaId

  // Determine query mode
  const isSingleQuery = typeof idOrFilter === 'string'
  const filter: QueryFilter<P> = typeof idOrFilter === 'object' ? idOrFilter : {}
  const nodeId = isSingleQuery ? idOrFilter : null

  // Memoize stringified where clause to avoid unnecessary re-renders
  // The string representation is stable when the filter content doesn't change
  const whereKey = useMemo(() => JSON.stringify(filter.where), [filter.where])

  // State - now using FlatNode
  const [data, setData] = useState<FlatNode<P>[] | FlatNode<P> | null>(isSingleQuery ? null : [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [migrationWarnings, setMigrationWarnings] = useState<MigrationWarning[]>([])

  // Track if we've loaded to prevent re-fetching
  const hasLoadedRef = useRef(false)
  // Track update count for devtools reporting
  const updateCountRef = useRef(0)

  // Query tracking for devtools
  const queryIdRef = useRef(
    `useQuery-${schemaId}-${nodeId || 'list'}-${Math.random().toString(36).slice(2, 8)}`
  )
  useEffect(() => {
    if (!instrumentation?.queryTracker) return
    const mode = isSingleQuery ? 'single' : filter.where ? 'filtered' : 'list'
    instrumentation.queryTracker.register(queryIdRef.current, {
      type: 'useQuery',
      schemaId,
      mode,
      filter: filter.where as Record<string, unknown> | undefined,
      nodeId: nodeId || undefined
    })
    return () => {
      instrumentation.queryTracker.unregister(queryIdRef.current)
    }
  }, [instrumentation, schemaId, isSingleQuery, nodeId])

  // Sort function
  const sortNodes = useCallback(
    (nodes: FlatNode<P>[]): FlatNode<P>[] => {
      if (!filter.orderBy) return nodes

      const entries = Object.entries(filter.orderBy) as [keyof InferCreateProps<P>, SortDirection][]
      if (entries.length === 0) return nodes

      return [...nodes].sort((a, b) => {
        for (const [key, direction] of entries) {
          const aVal = a[key as keyof FlatNode<P>]
          const bVal = b[key as keyof FlatNode<P>]

          if (aVal === bVal) continue

          // Handle null/undefined
          if (aVal == null) return direction === 'asc' ? 1 : -1
          if (bVal == null) return direction === 'asc' ? -1 : 1

          // Compare
          const comparison = aVal < bVal ? -1 : 1
          return direction === 'asc' ? comparison : -comparison
        }
        return 0
      })
    },
    [filter.orderBy]
  )

  // Load data
  const loadData = useCallback(async () => {
    if (!store) {
      setData(isSingleQuery ? null : [])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const warnings: MigrationWarning[] = []

      if (isSingleQuery && nodeId) {
        // Single node query
        const node = await store.get(nodeId)
        if (node && node.schemaId === schemaId && !node.deleted) {
          const flat = flattenNode<P>(node)
          setData(flat)

          // Collect migration warnings from the flattened node
          if (flat._migrationInfo && !flat._migrationInfo.lossless) {
            warnings.push({
              nodeId: flat.id,
              from: flat._migrationInfo.from,
              to: flat._migrationInfo.to,
              warnings: flat._migrationInfo.warnings
            })
          }
        } else {
          setData(null)
        }
      } else {
        // List query
        const nodes = await store.list({
          schemaId,
          includeDeleted: filter.includeDeleted,
          limit: filter.limit,
          offset: filter.offset
        })

        // Flatten all nodes
        let flattened = flattenNodes<P>(nodes)

        // Collect migration warnings from all migrated nodes
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

        // Apply where filter if present
        if (filter.where) {
          flattened = flattened.filter((node) => {
            for (const [key, value] of Object.entries(filter.where!)) {
              if (node[key as keyof FlatNode<P>] !== value) {
                return false
              }
            }
            return true
          })
        }

        // Apply sorting
        flattened = sortNodes(flattened)

        setData(flattened)
      }

      setMigrationWarnings(warnings)
      hasLoadedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setData(isSingleQuery ? null : [])
      instrumentation?.queryTracker?.recordError(queryIdRef.current, String(err))
    } finally {
      setLoading(false)
    }
  }, [
    store,
    schemaId,
    nodeId,
    isSingleQuery,
    filter.includeDeleted,
    filter.limit,
    filter.offset,
    whereKey,
    sortNodes
  ])

  // Auto-load on mount
  useEffect(() => {
    if (isReady && !hasLoadedRef.current) {
      loadData()
    }
  }, [isReady, loadData])

  // Report updates to devtools whenever data changes
  useEffect(() => {
    if (!instrumentation?.queryTracker || !hasLoadedRef.current) return
    const count = isSingleQuery ? (data ? 1 : 0) : Array.isArray(data) ? data.length : 0
    updateCountRef.current++
    instrumentation.queryTracker.recordUpdate(queryIdRef.current, count, 0)
  }, [data, instrumentation, isSingleQuery])

  // Subscribe to store changes
  useEffect(() => {
    if (!store) return

    const unsubscribe = store.subscribe((event: NodeChangeEvent) => {
      const { node } = event

      if (isSingleQuery && nodeId) {
        // Single node subscription
        if (event.change.payload.nodeId !== nodeId) return

        if (node && node.schemaId === schemaId && !node.deleted) {
          setData(flattenNode<P>(node))
        } else {
          setData(null)
        }
      } else {
        // List subscription
        if (node && node.schemaId !== schemaId) return

        setData((prev) => {
          const prevList = (prev as FlatNode<P>[]) || []

          if (!node) return prevList

          const flatNode = flattenNode<P>(node)

          // Check if node passes filter
          let passesFilter = true
          if (filter.where) {
            for (const [key, value] of Object.entries(filter.where)) {
              if (flatNode[key as keyof FlatNode<P>] !== value) {
                passesFilter = false
                break
              }
            }
          }

          const existingIndex = prevList.findIndex((n) => n.id === node.id)

          let newList: FlatNode<P>[]
          if (existingIndex >= 0) {
            // Update existing
            if (node.deleted && !filter.includeDeleted) {
              newList = prevList.filter((n) => n.id !== node.id)
            } else if (!passesFilter) {
              newList = prevList.filter((n) => n.id !== node.id)
            } else {
              newList = prevList.map((n) => (n.id === node.id ? flatNode : n))
            }
          } else if (!node.deleted && passesFilter) {
            // Add new
            newList = [...prevList, flatNode]
          } else {
            return prevList
          }

          // Re-sort after changes
          return sortNodes(newList)
        })
      }
    })

    return unsubscribe
  }, [store, schemaId, nodeId, isSingleQuery, filter.includeDeleted, whereKey, sortNodes])

  return {
    data,
    loading,
    error,
    reload: loadData,
    migrationWarnings
  } as QueryListResult<P> | QuerySingleResult<P>
}

// =============================================================================
// Re-export FlatNode for convenience
// =============================================================================

export { type FlatNode } from '../utils/flattenNode'
