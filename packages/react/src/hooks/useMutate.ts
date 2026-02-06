/**
 * useMutate - Unified write hook for Nodes via DataBridge
 *
 * A single hook for all write operations:
 * - Create nodes (requires schema)
 * - Update nodes (requires schema for type safety)
 * - Delete nodes (by ID)
 * - Atomic transactions (multiple operations)
 *
 * Uses DataBridge for off-main-thread data access.
 *
 * Features:
 * - Immediate local updates (bridge updates UI subscribers synchronously)
 * - Type-safe schema-bound mutations
 * - Transaction support for atomic multi-node operations
 * - Pending state tracking
 *
 * @example
 * ```tsx
 * const { create, update, remove, mutate, isPending } = useMutate()
 *
 * // Simple operations
 * await create(TaskSchema, { title: 'New Task', status: 'todo' })
 * await update(TaskSchema, taskId, { status: 'done' })  // Type-safe!
 * await remove(taskId)
 *
 * // Atomic transaction
 * await mutate([
 *   { type: 'create', schema: TaskSchema, data: { title: 'Task 1' } },
 *   { type: 'update', id: taskId, data: { status: 'done' } },
 *   { type: 'delete', id: oldTaskId }
 * ])
 * ```
 */
import type { DefinedSchema, PropertyBuilder, InferCreateProps, NodeState } from '@xnet/data'
import { useCallback, useState, useRef } from 'react'
import { useDataBridge } from '../context'
import { flattenNode, type FlatNode } from '../utils/flattenNode'

// =============================================================================
// Types
// =============================================================================

/**
 * Create operation for mutate
 */
export interface MutateCreate<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  type: 'create'
  schema: DefinedSchema<P>
  data: InferCreateProps<P>
  id?: string
}

/**
 * Update operation for mutate
 */
export interface MutateUpdate {
  type: 'update'
  id: string
  data: Record<string, unknown>
}

/**
 * Delete operation for mutate
 */
export interface MutateDelete {
  type: 'delete'
  id: string
}

/**
 * Restore operation for mutate
 */
export interface MutateRestore {
  type: 'restore'
  id: string
}

/**
 * All possible mutate operations
 */
export type MutateOp =
  | MutateCreate<Record<string, PropertyBuilder>>
  | MutateUpdate
  | MutateDelete
  | MutateRestore

/**
 * Result from a mutate transaction
 */
export interface MutateResult {
  /** Results for each operation (NodeState or null for delete) */
  results: (NodeState | null)[]
}

/**
 * Result from useMutate hook
 */
export interface UseMutateResult {
  /**
   * Create a new node.
   * Requires a schema to know what type to create.
   * Optionally specify a custom ID (otherwise auto-generated).
   *
   * @returns The created node (flattened), or null if creation failed
   */
  create: <P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ) => Promise<FlatNode<P> | null>

  /**
   * Update an existing node by ID.
   * Requires schema for type-safe property checking.
   *
   * @example
   * ```tsx
   * await update(TaskSchema, taskId, { status: 'done' })  // OK
   * await update(TaskSchema, taskId, { typo: 'x' })       // Type error!
   * ```
   *
   * @returns The updated node (flattened), or null if update failed
   */
  update: <P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    id: string,
    data: Partial<InferCreateProps<P>>
  ) => Promise<FlatNode<P> | null>

  /**
   * Delete a node by ID (soft delete).
   */
  remove: (id: string) => Promise<void>

  /**
   * Restore a deleted node by ID.
   *
   * @returns The restored node (flattened), or null if restore failed
   */
  restore: (id: string) => Promise<FlatNode<Record<string, PropertyBuilder>> | null>

  /**
   * Execute multiple operations atomically.
   * All operations succeed or fail together.
   *
   * Note: Transaction support requires MainThreadBridge with direct NodeStore access.
   * WorkerBridge executes operations sequentially (not truly atomic).
   */
  mutate: (ops: MutateOp[]) => Promise<MutateResult | null>

  /**
   * Whether any mutation is currently in progress.
   */
  isPending: boolean

  /**
   * Number of pending mutations.
   */
  pendingCount: number
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for all write operations on Nodes via DataBridge.
 *
 * Provides both convenience methods (create, update, remove) and
 * a full transaction API (mutate) for atomic multi-node operations.
 *
 * All operations update the local cache immediately, and subscribers
 * see changes synchronously. Background sync handles persistence.
 */
export function useMutate(): UseMutateResult {
  const bridge = useDataBridge()
  const [pendingCount, setPendingCount] = useState(0)
  const pendingRef = useRef(0)

  // Helper to track pending state
  const withPending = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    pendingRef.current++
    setPendingCount(pendingRef.current)
    try {
      return await fn()
    } finally {
      pendingRef.current--
      setPendingCount(pendingRef.current)
    }
  }, [])

  // Create a new node
  const create = useCallback(
    async <P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      data: InferCreateProps<P>,
      id?: string
    ): Promise<FlatNode<P> | null> => {
      if (!bridge) return null
      return withPending(async () => {
        const node = await bridge.create(schema, data, id)
        return flattenNode<P>(node)
      })
    },
    [bridge, withPending]
  )

  // Update an existing node (type-safe)
  const update = useCallback(
    async <P extends Record<string, PropertyBuilder>>(
      _schema: DefinedSchema<P>,
      id: string,
      data: Partial<InferCreateProps<P>>
    ): Promise<FlatNode<P> | null> => {
      if (!bridge) return null
      return withPending(async () => {
        const node = await bridge.update(id, data as Record<string, unknown>)
        return flattenNode<P>(node)
      })
    },
    [bridge, withPending]
  )

  // Delete a node
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!bridge) return
      return withPending(async () => {
        await bridge.delete(id)
      })
    },
    [bridge, withPending]
  )

  // Restore a deleted node
  const restore = useCallback(
    async (id: string): Promise<FlatNode<Record<string, PropertyBuilder>> | null> => {
      if (!bridge) return null
      return withPending(async () => {
        const node = await bridge.restore(id)
        return flattenNode<Record<string, PropertyBuilder>>(node)
      })
    },
    [bridge, withPending]
  )

  // Execute a transaction
  // Note: For WorkerBridge, operations are executed sequentially, not atomically.
  // True transactions require MainThreadBridge with direct NodeStore access.
  const mutate = useCallback(
    async (ops: MutateOp[]): Promise<MutateResult | null> => {
      if (!bridge || ops.length === 0) return null

      return withPending(async () => {
        const results: (NodeState | null)[] = []

        for (const op of ops) {
          switch (op.type) {
            case 'create': {
              const node = await bridge.create(op.schema, op.data as Record<string, unknown>, op.id)
              results.push(node)
              break
            }
            case 'update': {
              const node = await bridge.update(op.id, op.data)
              results.push(node)
              break
            }
            case 'delete': {
              await bridge.delete(op.id)
              results.push(null)
              break
            }
            case 'restore': {
              const node = await bridge.restore(op.id)
              results.push(node)
              break
            }
          }
        }

        return { results }
      })
    },
    [bridge, withPending]
  )

  return {
    create,
    update,
    remove,
    restore,
    mutate,
    isPending: pendingCount > 0,
    pendingCount
  }
}
