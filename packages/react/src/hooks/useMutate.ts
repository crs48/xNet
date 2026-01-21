/**
 * useMutate - Unified write hook for Nodes
 *
 * A single hook for all write operations:
 * - Create nodes (requires schema)
 * - Update nodes (by ID)
 * - Delete nodes (by ID)
 * - Atomic transactions (multiple operations)
 *
 * @example
 * ```tsx
 * const { create, update, remove, mutate } = useMutate()
 *
 * // Simple operations
 * await create(TaskSchema, { title: 'New Task', status: 'todo' })
 * await update(taskId, { status: 'done' })
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
import { useCallback } from 'react'
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  TransactionOperation,
  TransactionResult
} from '@xnet/data'
import { useNodeStore } from './useNodeStore'
import type { TypedNode } from './useQuery'

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
 * Result from useMutate hook
 */
export interface UseMutateResult {
  /**
   * Create a new node.
   * Requires a schema to know what type to create.
   * Optionally specify a custom ID (otherwise auto-generated).
   */
  create: <P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ) => Promise<TypedNode<P> | null>

  /**
   * Update an existing node by ID.
   * Schema not required - node already knows its type.
   */
  update: (id: string, data: Record<string, unknown>) => Promise<NodeState | null>

  /**
   * Delete a node by ID (soft delete).
   */
  remove: (id: string) => Promise<void>

  /**
   * Restore a deleted node by ID.
   */
  restore: (id: string) => Promise<NodeState | null>

  /**
   * Execute multiple operations atomically.
   * All operations succeed or fail together.
   */
  mutate: (ops: MutateOp[]) => Promise<TransactionResult | null>

  /**
   * Whether a mutation is in progress.
   */
  isPending: boolean
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for all write operations on Nodes.
 *
 * Provides both convenience methods (create, update, remove) and
 * a full transaction API (mutate) for atomic multi-node operations.
 */
export function useMutate(): UseMutateResult {
  const { store, isReady } = useNodeStore()

  // Create a new node
  const create = useCallback(
    async <P extends Record<string, PropertyBuilder>>(
      schema: DefinedSchema<P>,
      data: InferCreateProps<P>,
      id?: string
    ): Promise<TypedNode<P> | null> => {
      if (!store || !isReady) return null

      const node = await store.create({
        id,
        schemaId: schema._schemaId,
        properties: data as Record<string, unknown>
      })

      return node as TypedNode<P>
    },
    [store, isReady]
  )

  // Update an existing node
  const update = useCallback(
    async (id: string, data: Record<string, unknown>): Promise<NodeState | null> => {
      if (!store || !isReady) return null

      return store.update(id, { properties: data })
    },
    [store, isReady]
  )

  // Delete a node
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!store || !isReady) return

      await store.delete(id)
    },
    [store, isReady]
  )

  // Restore a deleted node
  const restore = useCallback(
    async (id: string): Promise<NodeState | null> => {
      if (!store || !isReady) return null

      return store.restore(id)
    },
    [store, isReady]
  )

  // Execute a transaction
  const mutate = useCallback(
    async (ops: MutateOp[]): Promise<TransactionResult | null> => {
      if (!store || !isReady || ops.length === 0) return null

      // Convert MutateOp[] to TransactionOperation[]
      const storeOps: TransactionOperation[] = ops.map((op) => {
        switch (op.type) {
          case 'create':
            return {
              type: 'create' as const,
              options: {
                schemaId: op.schema._schemaId,
                properties: op.data as Record<string, unknown>
              }
            }
          case 'update':
            return {
              type: 'update' as const,
              nodeId: op.id,
              options: { properties: op.data }
            }
          case 'delete':
            return { type: 'delete' as const, nodeId: op.id }
          case 'restore':
            return { type: 'restore' as const, nodeId: op.id }
        }
      })

      return store.transaction(storeOps)
    },
    [store, isReady]
  )

  return {
    create,
    update,
    remove,
    restore,
    mutate,
    isPending: false // Could add state tracking if needed
  }
}
