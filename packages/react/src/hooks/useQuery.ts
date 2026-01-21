/**
 * useQuery - Unified read hook for Nodes
 *
 * A single hook for all read operations:
 * - List all nodes of a schema
 * - Get a single node by ID
 * - Query with filters
 *
 * @example
 * ```tsx
 * // List all tasks
 * const { data: tasks } = useQuery(TaskSchema)
 *
 * // Get single task by ID
 * const { data: task } = useQuery(TaskSchema, taskId)
 *
 * // Query with filters
 * const { data: urgent } = useQuery(TaskSchema, {
 *   where: { status: 'urgent' }
 * })
 * ```
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  NodeChangeEvent
} from '@xnet/data'
import { useNodeStore } from './useNodeStore'

// =============================================================================
// Types
// =============================================================================

/**
 * A typed node state that matches the schema's properties
 */
export interface TypedNode<P extends Record<string, PropertyBuilder>> extends NodeState {
  properties: InferCreateProps<P>
}

/**
 * Query filter options
 */
export interface QueryFilter {
  /** Filter conditions (property: value) */
  where?: Record<string, unknown>
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Result when querying a list of nodes
 */
export interface QueryListResult<P extends Record<string, PropertyBuilder>> {
  /** The queried nodes */
  data: TypedNode<P>[]
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the query */
  reload: () => Promise<void>
}

/**
 * Result when querying a single node
 */
export interface QuerySingleResult<P extends Record<string, PropertyBuilder>> {
  /** The queried node (null if not found) */
  data: TypedNode<P> | null
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the query */
  reload: () => Promise<void>
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
  filter: QueryFilter
): QueryListResult<P>

/**
 * Query nodes - implementation
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  idOrFilter?: string | QueryFilter
): QueryListResult<P> | QuerySingleResult<P> {
  const { store, isReady } = useNodeStore()
  const schemaId = schema._schemaId

  // Determine query mode
  const isSingleQuery = typeof idOrFilter === 'string'
  const filter: QueryFilter = typeof idOrFilter === 'object' ? idOrFilter : {}
  const nodeId = isSingleQuery ? idOrFilter : null

  // State
  const [data, setData] = useState<TypedNode<P>[] | TypedNode<P> | null>(isSingleQuery ? null : [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Track if we've loaded to prevent re-fetching
  const hasLoadedRef = useRef(false)

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
      if (isSingleQuery && nodeId) {
        // Single node query
        const node = await store.get(nodeId)
        if (node && node.schemaId === schemaId && !node.deleted) {
          setData(node as TypedNode<P>)
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

        // Apply where filter if present
        let filtered = nodes as TypedNode<P>[]
        if (filter.where) {
          filtered = filtered.filter((node) => {
            for (const [key, value] of Object.entries(filter.where!)) {
              if ((node.properties as Record<string, unknown>)[key] !== value) {
                return false
              }
            }
            return true
          })
        }

        setData(filtered)
      }
      hasLoadedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setData(isSingleQuery ? null : [])
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
    JSON.stringify(filter.where)
  ])

  // Auto-load on mount
  useEffect(() => {
    if (isReady && !hasLoadedRef.current) {
      loadData()
    }
  }, [isReady, loadData])

  // Subscribe to store changes
  useEffect(() => {
    if (!store) return

    const unsubscribe = store.subscribe((event: NodeChangeEvent) => {
      const { node } = event

      if (isSingleQuery && nodeId) {
        // Single node subscription
        if (event.change.payload.nodeId !== nodeId) return

        if (node && node.schemaId === schemaId && !node.deleted) {
          setData(node as TypedNode<P>)
        } else {
          setData(null)
        }
      } else {
        // List subscription
        if (node && node.schemaId !== schemaId) return

        setData((prev) => {
          const prevList = (prev as TypedNode<P>[]) || []

          if (!node) return prevList

          // Check if node passes filter
          let passesFilter = true
          if (filter.where) {
            for (const [key, value] of Object.entries(filter.where)) {
              if ((node.properties as Record<string, unknown>)[key] !== value) {
                passesFilter = false
                break
              }
            }
          }

          const existingIndex = prevList.findIndex((n) => n.id === node.id)

          if (existingIndex >= 0) {
            // Update existing
            if (node.deleted && !filter.includeDeleted) {
              return prevList.filter((n) => n.id !== node.id)
            }
            if (!passesFilter) {
              return prevList.filter((n) => n.id !== node.id)
            }
            return prevList.map((n) => (n.id === node.id ? (node as TypedNode<P>) : n))
          } else if (!node.deleted && passesFilter) {
            // Add new
            return [...prevList, node as TypedNode<P>]
          }

          return prevList
        })
      }
    })

    return unsubscribe
  }, [store, schemaId, nodeId, isSingleQuery, filter.includeDeleted, JSON.stringify(filter.where)])

  return {
    data,
    loading,
    error,
    reload: loadData
  } as QueryListResult<P> | QuerySingleResult<P>
}
