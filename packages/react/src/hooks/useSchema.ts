/**
 * useSchema - Schema-aware hooks for typed Node operations
 *
 * Provides type-safe CRUD operations for Nodes with full schema inference.
 *
 * @example
 * ```tsx
 * // Define your schema
 * const TaskSchema = defineSchema({
 *   name: 'Task',
 *   namespace: 'xnet://myapp/',
 *   properties: {
 *     title: text({ required: true }),
 *     status: select({ options: ['todo', 'in-progress', 'done'] as const }),
 *     dueDate: date()
 *   }
 * })
 *
 * // Use in component - fully typed!
 * function TaskList() {
 *   const { nodes, create, loading } = useSchema(TaskSchema)
 *
 *   const handleAdd = () => {
 *     create({ title: 'New Task', status: 'todo' })
 *   }
 *
 *   return (
 *     <ul>
 *       {nodes.map(task => (
 *         <li key={task.id}>{task.properties.title}</li>
 *       ))}
 *       <button onClick={handleAdd}>Add Task</button>
 *     </ul>
 *   )
 * }
 * ```
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  SchemaIRI,
  TransactionOperation,
  TransactionResult,
  NodeChangeEvent
} from '@xnet/data'
import { useNodeStore } from './useNodeStore'

// =============================================================================
// Types
// =============================================================================

/**
 * A typed node state that matches the schema's properties
 */
export interface TypedNodeState<P extends Record<string, PropertyBuilder>> extends NodeState {
  properties: InferCreateProps<P>
}

/**
 * Options for useSchema hook
 */
export interface UseSchemaOptions {
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
  /** Maximum number of nodes to fetch */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Whether to auto-load on mount (default: true) */
  autoLoad?: boolean
}

/**
 * Transaction operation builder for typed schemas
 */
export type TypedTransactionOp<P extends Record<string, PropertyBuilder>> =
  | { type: 'create'; properties: InferCreateProps<P> }
  | { type: 'update'; id: string; properties: Partial<InferCreateProps<P>> }
  | { type: 'delete'; id: string }
  | { type: 'restore'; id: string }

/**
 * Result from useSchema hook
 */
export interface UseSchemaResult<P extends Record<string, PropertyBuilder>> {
  /** List of nodes matching this schema */
  nodes: TypedNodeState<P>[]
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Create a new node of this schema type */
  create: (properties: InferCreateProps<P>) => Promise<TypedNodeState<P> | null>
  /** Update a node's properties */
  update: (
    id: string,
    properties: Partial<InferCreateProps<P>>
  ) => Promise<TypedNodeState<P> | null>
  /** Delete a node (soft delete) */
  remove: (id: string) => Promise<void>
  /** Restore a deleted node */
  restore: (id: string) => Promise<TypedNodeState<P> | null>
  /** Execute multiple operations atomically as a transaction */
  transaction: (ops: TypedTransactionOp<P>[]) => Promise<TransactionResult | null>
  /** Reload the list */
  reload: () => Promise<void>
  /** Get a single node by ID */
  getById: (id: string) => TypedNodeState<P> | undefined
  /** Total count of nodes (for pagination) */
  count: number
  /** The schema being used */
  schema: DefinedSchema<P>
}

/**
 * Result from useSingleNode hook
 */
export interface UseSingleNodeResult<P extends Record<string, PropertyBuilder>> {
  /** The node data */
  node: TypedNodeState<P> | null
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Update the node's properties */
  update: (properties: Partial<InferCreateProps<P>>) => Promise<TypedNodeState<P> | null>
  /** Delete the node */
  remove: () => Promise<void>
  /** Restore the node if deleted */
  restore: () => Promise<TypedNodeState<P> | null>
  /** Reload the node */
  reload: () => Promise<void>
}

// =============================================================================
// useSchema Hook
// =============================================================================

/**
 * Schema-aware hook for working with typed Nodes.
 *
 * Provides a fully type-safe API for CRUD operations on nodes matching a schema.
 *
 * @param schema - The schema definition (from defineSchema)
 * @param options - Query options (limit, offset, includeDeleted)
 * @returns Typed nodes and CRUD operations
 */
export function useSchema<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  options: UseSchemaOptions = {}
): UseSchemaResult<P> {
  const { includeDeleted = false, limit, offset, autoLoad = true } = options
  const { store, isReady } = useNodeStore()

  const schemaId = schema._schemaId

  const [nodes, setNodes] = useState<TypedNodeState<P>[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [count, setCount] = useState(0)

  // Track if this is the first load to prevent re-fetching on option changes
  const hasLoadedRef = useRef(false)

  // Load nodes matching the schema
  const loadNodes = useCallback(async () => {
    if (!store) {
      setNodes([])
      setCount(0)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await store.list({ schemaId, includeDeleted, limit, offset })
      setNodes(result as TypedNodeState<P>[])
      setCount(result.length) // TODO: Get actual count from storage
      hasLoadedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setNodes([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }, [store, schemaId, includeDeleted, limit, offset])

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && isReady && !hasLoadedRef.current) {
      loadNodes()
    }
  }, [autoLoad, isReady, loadNodes])

  // Reload when options change (after first load)
  useEffect(() => {
    if (hasLoadedRef.current && isReady) {
      loadNodes()
    }
  }, [schemaId, includeDeleted, limit, offset])

  // Create a new node
  const create = useCallback(
    async (properties: InferCreateProps<P>): Promise<TypedNodeState<P> | null> => {
      if (!store) return null

      setLoading(true)
      setError(null)

      try {
        const created = await store.create({
          schemaId,
          properties: properties as Record<string, unknown>
        })

        // Note: Local state update happens via subscription listener
        const typedNode = created as TypedNodeState<P>
        return typedNode
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store, schemaId]
  )

  // Update a node
  const update = useCallback(
    async (
      id: string,
      properties: Partial<InferCreateProps<P>>
    ): Promise<TypedNodeState<P> | null> => {
      if (!store) return null

      setLoading(true)
      setError(null)

      try {
        const updated = await store.update(id, {
          properties: properties as Record<string, unknown>
        })

        // Note: Local state update happens via subscription listener
        const typedNode = updated as TypedNodeState<P>
        return typedNode
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store]
  )

  // Delete a node
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!store) return

      setLoading(true)
      setError(null)

      try {
        await store.delete(id)
        // Note: Local state update happens via subscription listener
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    },
    [store]
  )

  // Restore a deleted node
  const restore = useCallback(
    async (id: string): Promise<TypedNodeState<P> | null> => {
      if (!store) return null

      setLoading(true)
      setError(null)

      try {
        const restored = await store.restore(id)
        // Note: Local state update happens via subscription listener
        const typedNode = restored as TypedNodeState<P>
        return typedNode
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store]
  )

  // Get a node by ID from local state
  const getById = useCallback(
    (id: string): TypedNodeState<P> | undefined => {
      return nodes.find((n) => n.id === id)
    },
    [nodes]
  )

  // Execute a transaction (multiple operations atomically)
  const transaction = useCallback(
    async (ops: TypedTransactionOp<P>[]): Promise<TransactionResult | null> => {
      if (!store || ops.length === 0) return null

      setLoading(true)
      setError(null)

      try {
        // Convert typed ops to TransactionOperation[]
        const storeOps: TransactionOperation[] = ops.map((op) => {
          switch (op.type) {
            case 'create':
              return {
                type: 'create' as const,
                options: {
                  schemaId,
                  properties: op.properties as Record<string, unknown>
                }
              }
            case 'update':
              return {
                type: 'update' as const,
                nodeId: op.id,
                options: { properties: op.properties as Record<string, unknown> }
              }
            case 'delete':
              return { type: 'delete' as const, nodeId: op.id }
            case 'restore':
              return { type: 'restore' as const, nodeId: op.id }
          }
        })

        const result = await store.transaction(storeOps)

        // Reload to get updated state
        await loadNodes()

        return result
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store, schemaId, loadNodes]
  )

  // Subscribe to store changes for reactive updates
  useEffect(() => {
    if (!store) return

    const unsubscribe = store.subscribe((event: NodeChangeEvent) => {
      const { change, node } = event

      // Only handle changes for our schema
      if (node && node.schemaId !== schemaId) return

      // Update local state based on the change
      if (node) {
        setNodes((prev) => {
          const existingIndex = prev.findIndex((n) => n.id === node.id)

          if (existingIndex >= 0) {
            // Update existing node
            if (node.deleted && !includeDeleted) {
              // Remove deleted node from list
              setCount((c) => Math.max(0, c - 1))
              return prev.filter((n) => n.id !== node.id)
            }
            // Replace with updated node
            return prev.map((n) => (n.id === node.id ? (node as TypedNodeState<P>) : n))
          } else if (!node.deleted || includeDeleted) {
            // Add new node
            setCount((c) => c + 1)
            return [...prev, node as TypedNodeState<P>]
          }
          return prev
        })
      }
    })

    return unsubscribe
  }, [store, schemaId, includeDeleted])

  return {
    nodes,
    loading,
    error,
    create,
    update,
    remove,
    restore,
    transaction,
    reload: loadNodes,
    getById,
    count,
    schema
  }
}

// =============================================================================
// useSingleNode Hook
// =============================================================================

/**
 * Hook for working with a single typed Node.
 *
 * @param schema - The schema definition
 * @param nodeId - The node ID to load
 * @returns The node and operations
 *
 * @example
 * ```tsx
 * function TaskDetail({ taskId }: { taskId: string }) {
 *   const { node, update, loading } = useSingleNode(TaskSchema, taskId)
 *
 *   if (loading) return <Spinner />
 *   if (!node) return <NotFound />
 *
 *   return (
 *     <div>
 *       <h1>{node.properties.title}</h1>
 *       <select
 *         value={node.properties.status}
 *         onChange={(e) => update({ status: e.target.value })}
 *       >
 *         <option value="todo">Todo</option>
 *         <option value="done">Done</option>
 *       </select>
 *     </div>
 *   )
 * }
 * ```
 */
export function useSingleNode<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  nodeId: string | null
): UseSingleNodeResult<P> {
  const { store, isReady } = useNodeStore()

  const [node, setNode] = useState<TypedNodeState<P> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load the node
  const loadNode = useCallback(async () => {
    if (!store || !nodeId) {
      setNode(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await store.get(nodeId)
      if (result && result.schemaId === schema._schemaId) {
        setNode(result as TypedNodeState<P>)
      } else {
        setNode(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setNode(null)
    } finally {
      setLoading(false)
    }
  }, [store, nodeId, schema._schemaId])

  // Auto-load on mount and when nodeId changes
  useEffect(() => {
    if (isReady && nodeId) {
      loadNode()
    }
  }, [isReady, nodeId, loadNode])

  // Subscribe to store changes for reactive updates
  useEffect(() => {
    if (!store || !nodeId) return

    const unsubscribe = store.subscribe((event: NodeChangeEvent) => {
      const { change, node: changedNode } = event

      // Only handle changes for our node
      if (change.payload.nodeId !== nodeId) return

      // Update local state
      if (changedNode && changedNode.schemaId === schema._schemaId) {
        setNode(changedNode as TypedNodeState<P>)
      }
    })

    return unsubscribe
  }, [store, nodeId, schema._schemaId])

  // Update the node
  const update = useCallback(
    async (properties: Partial<InferCreateProps<P>>): Promise<TypedNodeState<P> | null> => {
      if (!store || !nodeId) return null

      setLoading(true)
      setError(null)

      try {
        const updated = await store.update(nodeId, {
          properties: properties as Record<string, unknown>
        })
        const typedNode = updated as TypedNodeState<P>
        setNode(typedNode)
        return typedNode
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store, nodeId]
  )

  // Delete the node
  const remove = useCallback(async (): Promise<void> => {
    if (!store || !nodeId) return

    setLoading(true)
    setError(null)

    try {
      await store.delete(nodeId)
      const updated = await store.get(nodeId)
      setNode(updated as TypedNodeState<P> | null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, nodeId])

  // Restore the node
  const restore = useCallback(async (): Promise<TypedNodeState<P> | null> => {
    if (!store || !nodeId) return null

    setLoading(true)
    setError(null)

    try {
      const restored = await store.restore(nodeId)
      const typedNode = restored as TypedNodeState<P>
      setNode(typedNode)
      return typedNode
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      setLoading(false)
    }
  }, [store, nodeId])

  return {
    node,
    loading,
    error,
    update,
    remove,
    restore,
    reload: loadNode
  }
}
