/**
 * useNode hook for working with schema-typed Nodes
 *
 * Provides CRUD operations for a single Node with automatic state management.
 */
import { useState, useEffect, useCallback } from 'react'
import type { NodeState, NodeId, SchemaIRI } from '@xnet/data'
import { useNodeStore } from './useNodeStore'

/**
 * Options for useNode hook
 */
export interface UseNodeOptions {
  /** Automatically load the node on mount (default: true) */
  autoLoad?: boolean
}

/**
 * Result from useNode hook
 */
export interface UseNodeResult<T extends NodeState = NodeState> {
  /** The node data (null if not loaded or doesn't exist) */
  node: T | null
  /** Whether the node is currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the node from storage */
  reload: () => Promise<void>
  /** Update the node's properties */
  update: (properties: Partial<T['properties']>) => Promise<T | null>
  /** Delete the node (soft delete) */
  remove: () => Promise<void>
  /** Restore a deleted node */
  restore: () => Promise<T | null>
}

/**
 * Hook for working with a single Node
 *
 * @example
 * ```tsx
 * function TaskView({ taskId }: { taskId: string }) {
 *   const { node, loading, update, remove } = useNode(taskId)
 *
 *   if (loading) return <Spinner />
 *   if (!node) return <NotFound />
 *
 *   return (
 *     <div>
 *       <h1>{node.properties.title}</h1>
 *       <button onClick={() => update({ status: 'done' })}>
 *         Mark Complete
 *       </button>
 *       <button onClick={remove}>Delete</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useNode<T extends NodeState = NodeState>(
  nodeId: NodeId | null,
  options: UseNodeOptions = {}
): UseNodeResult<T> {
  const { autoLoad = true } = options
  const { store, isReady } = useNodeStore()

  const [node, setNode] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load node
  const loadNode = useCallback(async () => {
    if (!store || !nodeId) {
      setNode(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await store.get(nodeId)
      setNode(result as T | null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setNode(null)
    } finally {
      setLoading(false)
    }
  }, [store, nodeId])

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && isReady && nodeId) {
      loadNode()
    }
  }, [autoLoad, isReady, nodeId, loadNode])

  // Update node properties
  const update = useCallback(
    async (properties: Partial<T['properties']>): Promise<T | null> => {
      if (!store || !nodeId) return null

      setLoading(true)
      setError(null)

      try {
        const updated = await store.update(nodeId, { properties })
        setNode(updated as T)
        return updated as T
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store, nodeId]
  )

  // Delete node (soft delete)
  const remove = useCallback(async (): Promise<void> => {
    if (!store || !nodeId) return

    setLoading(true)
    setError(null)

    try {
      await store.delete(nodeId)
      // Reload to get updated state
      const updated = await store.get(nodeId)
      setNode(updated as T | null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, nodeId])

  // Restore deleted node
  const restore = useCallback(async (): Promise<T | null> => {
    if (!store || !nodeId) return null

    setLoading(true)
    setError(null)

    try {
      const restored = await store.restore(nodeId)
      setNode(restored as T)
      return restored as T
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
    reload: loadNode,
    update,
    remove,
    restore
  }
}

/**
 * Options for useNodes hook
 */
export interface UseNodesOptions {
  /** Filter by schema IRI */
  schemaId?: SchemaIRI
  /** Include deleted nodes */
  includeDeleted?: boolean
  /** Maximum number of nodes to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Automatically load on mount (default: true) */
  autoLoad?: boolean
}

/**
 * Result from useNodes hook
 */
export interface UseNodesResult<T extends NodeState = NodeState> {
  /** List of nodes */
  nodes: T[]
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Reload the list */
  reload: () => Promise<void>
  /** Create a new node */
  create: (schemaId: SchemaIRI, properties: Record<string, unknown>) => Promise<T | null>
}

/**
 * Hook for working with a list of Nodes
 *
 * @example
 * ```tsx
 * function TaskList() {
 *   const { nodes, loading, create } = useNodes({
 *     schemaId: 'xnet://xnet.dev/Task'
 *   })
 *
 *   if (loading) return <Spinner />
 *
 *   return (
 *     <div>
 *       {nodes.map(task => (
 *         <TaskItem key={task.id} task={task} />
 *       ))}
 *       <button onClick={() => create('xnet://xnet.dev/Task', { title: 'New Task' })}>
 *         Add Task
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useNodes<T extends NodeState = NodeState>(
  options: UseNodesOptions = {}
): UseNodesResult<T> {
  const { schemaId, includeDeleted, limit, offset, autoLoad = true } = options
  const { store, isReady } = useNodeStore()

  const [nodes, setNodes] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load nodes
  const loadNodes = useCallback(async () => {
    if (!store) {
      setNodes([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await store.list({ schemaId, includeDeleted, limit, offset })
      setNodes(result as T[])
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [store, schemaId, includeDeleted, limit, offset])

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && isReady) {
      loadNodes()
    }
  }, [autoLoad, isReady, loadNodes])

  // Create a new node
  const create = useCallback(
    async (nodeSchemaId: SchemaIRI, properties: Record<string, unknown>): Promise<T | null> => {
      if (!store) return null

      setLoading(true)
      setError(null)

      try {
        const created = await store.create({ schemaId: nodeSchemaId, properties })
        // Reload list to include new node
        await loadNodes()
        return created as T
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      } finally {
        setLoading(false)
      }
    },
    [store, loadNodes]
  )

  return {
    nodes,
    loading,
    error,
    reload: loadNodes,
    create
  }
}
