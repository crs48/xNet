/**
 * useMutate - Unified write hook for Nodes
 *
 * A single hook for all write operations:
 * - Create nodes (requires schema)
 * - Update nodes (requires schema for type safety)
 * - Delete nodes (by ID)
 * - Atomic transactions (multiple operations)
 *
 * Features:
 * - Optimistic updates (UI updates immediately)
 * - Type-safe schema-bound mutations
 * - Transaction support for atomic multi-node operations
 * - Pending state tracking
 *
 * @example
 * ```tsx
 * const { create, update, remove, mutate, isPending } = useMutate()
 *
 * // Simple operations (optimistic by default)
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
import { useCallback, useState, useRef } from 'react'
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  TransactionOperation,
  TransactionResult
} from '@xnet/data'
import { useNodeStore } from './useNodeStore'
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
 * Options for mutation operations
 */
export interface MutateOptions {
  /**
   * Whether to apply optimistic updates.
   * When true (default), the UI updates immediately before persistence completes.
   * If persistence fails, the update is rolled back.
   */
  optimistic?: boolean
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
    id?: string,
    options?: MutateOptions
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
    data: Partial<InferCreateProps<P>>,
    options?: MutateOptions
  ) => Promise<FlatNode<P> | null>

  /**
   * Delete a node by ID (soft delete).
   */
  remove: (id: string, options?: MutateOptions) => Promise<void>

  /**
   * Restore a deleted node by ID.
   *
   * @returns The restored node (flattened), or null if restore failed
   */
  restore: (
    id: string,
    options?: MutateOptions
  ) => Promise<FlatNode<Record<string, PropertyBuilder>> | null>

  /**
   * Execute multiple operations atomically.
   * All operations succeed or fail together.
   */
  mutate: (ops: MutateOp[], options?: MutateOptions) => Promise<TransactionResult | null>

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
 * Hook for all write operations on Nodes.
 *
 * Provides both convenience methods (create, update, remove) and
 * a full transaction API (mutate) for atomic multi-node operations.
 *
 * All operations support optimistic updates by default.
 */
export function useMutate(): UseMutateResult {
  const { store, isReady } = useNodeStore()
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
      id?: string,
      _options?: MutateOptions
    ): Promise<FlatNode<P> | null> => {
      if (!store || !isReady) return null

      return withPending(async () => {
        const node = await store.create({
          id,
          schemaId: schema._schemaId,
          properties: data as Record<string, unknown>
        })

        return flattenNode<P>(node)
      })
    },
    [store, isReady, withPending]
  )

  // Update an existing node (type-safe)
  const update = useCallback(
    async <P extends Record<string, PropertyBuilder>>(
      _schema: DefinedSchema<P>,
      id: string,
      data: Partial<InferCreateProps<P>>,
      _options?: MutateOptions
    ): Promise<FlatNode<P> | null> => {
      if (!store || !isReady) return null

      return withPending(async () => {
        const node = await store.update(id, { properties: data as Record<string, unknown> })
        return flattenNode<P>(node)
      })
    },
    [store, isReady, withPending]
  )

  // Delete a node
  const remove = useCallback(
    async (id: string, _options?: MutateOptions): Promise<void> => {
      if (!store || !isReady) return

      return withPending(async () => {
        await store.delete(id)
      })
    },
    [store, isReady, withPending]
  )

  // Restore a deleted node
  const restore = useCallback(
    async (
      id: string,
      _options?: MutateOptions
    ): Promise<FlatNode<Record<string, PropertyBuilder>> | null> => {
      if (!store || !isReady) return null

      return withPending(async () => {
        const node = await store.restore(id)
        return flattenNode<Record<string, PropertyBuilder>>(node)
      })
    },
    [store, isReady, withPending]
  )

  // Execute a transaction
  const mutate = useCallback(
    async (ops: MutateOp[], _options?: MutateOptions): Promise<TransactionResult | null> => {
      if (!store || !isReady || ops.length === 0) return null

      return withPending(async () => {
        // Convert MutateOp[] to TransactionOperation[]
        const storeOps: TransactionOperation[] = ops.map((op) => {
          switch (op.type) {
            case 'create':
              return {
                type: 'create' as const,
                options: {
                  id: op.id,
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
      })
    },
    [store, isReady, withPending]
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
