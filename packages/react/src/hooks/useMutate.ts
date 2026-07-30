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
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  TransactionOperation,
  NodeBatchWriteInput,
  NodeBatchWriteResult
} from '@xnetjs/data'
import { isTempId } from '@xnetjs/data'
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useDataBridge } from '../context'
import { useTelemetryReporter } from '../context/telemetry-context'
import { useTracingReporter, TRACE_STAGES } from '../context/tracing-context'
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
  /** Batch ID when transaction backend is available */
  batchId?: string
  /** Temp ID mapping when transaction backend is available */
  tempIds?: Record<string, string>
}

function hasTempIdInValue(value: unknown): boolean {
  if (isTempId(value)) return true
  if (Array.isArray(value)) {
    return value.some((item) => hasTempIdInValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasTempIdInValue(item))
  }
  return false
}

function hasTempIdsInOps(ops: MutateOp[]): boolean {
  return ops.some((op) => {
    switch (op.type) {
      case 'create':
        return Boolean((op.id && isTempId(op.id)) || hasTempIdInValue(op.data))
      case 'update':
        return isTempId(op.id) || hasTempIdInValue(op.data)
      case 'delete':
      case 'restore':
        return isTempId(op.id)
    }
  })
}

function toTransactionOperations(ops: MutateOp[]): TransactionOperation[] {
  return ops.map((op) => {
    switch (op.type) {
      case 'create':
        return {
          type: 'create',
          options: {
            id: op.id,
            schemaId: op.schema._schemaId,
            properties: op.data as Record<string, unknown>
          }
        }
      case 'update':
        return {
          type: 'update',
          nodeId: op.id,
          options: {
            properties: op.data
          }
        }
      case 'delete':
        return {
          type: 'delete',
          nodeId: op.id
        }
      case 'restore':
        return {
          type: 'restore',
          nodeId: op.id
        }
    }
  })
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
   * Note: Atomicity requires a bridge implementing DataBridge.transaction
   * (MainThreadBridge, WorkerBridge, NativeBridge all do). Bridges without
   * it execute operations sequentially (not truly atomic).
   */
  mutate: (ops: MutateOp[]) => Promise<MutateResult | null>

  /**
   * Execute a storage-owned bulk write.
   */
  bulk: (input: NodeBatchWriteInput) => Promise<NodeBatchWriteResult | null>

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
 *
 * @public
 */
export function useMutate(): UseMutateResult {
  const bridge = useDataBridge()
  const telemetry = useTelemetryReporter()
  const tracing = useTracingReporter()

  // Pending state is tracked subscription-on-read: the snapshot only
  // reflects what the component actually read on a previous render
  // (nothing / isPending / pendingCount), so components that never
  // destructure pending state pay zero re-renders per mutation, and
  // isPending readers only re-render on idle<->busy transitions.
  const pendingRef = useRef(0)
  const pendingListenersRef = useRef<Set<() => void> | null>(null)
  pendingListenersRef.current ??= new Set()
  // 0 = pending state never read, 1 = isPending read, 2 = pendingCount read
  const pendingReadLevelRef = useRef(0)

  const subscribePending = useCallback((listener: () => void) => {
    const listeners = pendingListenersRef.current!
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  const getPendingSnapshot = useCallback(() => {
    if (pendingReadLevelRef.current === 0) return 0
    if (pendingReadLevelRef.current === 1) return pendingRef.current > 0 ? 1 : 0
    return pendingRef.current
  }, [])
  useSyncExternalStore(subscribePending, getPendingSnapshot, getPendingSnapshot)

  // Helper to track pending state
  const withPending = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    const notify = () => {
      for (const listener of pendingListenersRef.current!) {
        listener()
      }
    }
    pendingRef.current++
    notify()
    try {
      return await fn()
    } finally {
      pendingRef.current--
      notify()
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
      const start = telemetry ? Date.now() : 0
      const trace = tracing?.startTrace('mutate', 'mutate:create')
      try {
        const result = await withPending(async () => {
          const endBridge = trace?.mark(TRACE_STAGES.mutateBridge)
          const node = await bridge.create(schema, data, id)
          endBridge?.()
          return flattenNode<P>(node)
        })
        telemetry?.reportPerformance('react.useMutate.create', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.create.success', 1)
        trace?.end()
        return result
      } catch (err) {
        trace?.end()
        telemetry?.reportUsage('react.useMutate.create.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.create'
        })
        throw err
      }
    },
    [bridge, telemetry, tracing, withPending]
  )

  // Update an existing node (type-safe)
  const update = useCallback(
    async <P extends Record<string, PropertyBuilder>>(
      _schema: DefinedSchema<P>,
      id: string,
      data: Partial<InferCreateProps<P>>
    ): Promise<FlatNode<P> | null> => {
      if (!bridge) return null
      const start = telemetry ? Date.now() : 0
      const trace = tracing?.startTrace('mutate', 'mutate:update')
      try {
        const result = await withPending(async () => {
          const endBridge = trace?.mark(TRACE_STAGES.mutateBridge)
          const node = await bridge.update(id, data as Record<string, unknown>)
          endBridge?.()
          return flattenNode<P>(node)
        })
        telemetry?.reportPerformance('react.useMutate.update', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.update.success', 1)
        trace?.end()
        return result
      } catch (err) {
        trace?.end()
        telemetry?.reportUsage('react.useMutate.update.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.update',
          nodeId: id
        })
        throw err
      }
    },
    [bridge, telemetry, tracing, withPending]
  )

  // Delete a node
  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!bridge) return
      const start = telemetry ? Date.now() : 0
      const trace = tracing?.startTrace('mutate', 'mutate:delete')
      try {
        await withPending(async () => {
          const endBridge = trace?.mark(TRACE_STAGES.mutateBridge)
          await bridge.delete(id)
          endBridge?.()
        })
        telemetry?.reportPerformance('react.useMutate.delete', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.delete.success', 1)
        trace?.end()
      } catch (err) {
        trace?.end()
        telemetry?.reportUsage('react.useMutate.delete.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.delete',
          nodeId: id
        })
        throw err
      }
    },
    [bridge, telemetry, tracing, withPending]
  )

  // Restore a deleted node
  const restore = useCallback(
    async (id: string): Promise<FlatNode<Record<string, PropertyBuilder>> | null> => {
      if (!bridge) return null
      const start = telemetry ? Date.now() : 0
      const trace = tracing?.startTrace('mutate', 'mutate:restore')
      try {
        const result = await withPending(async () => {
          const endBridge = trace?.mark(TRACE_STAGES.mutateBridge)
          const node = await bridge.restore(id)
          endBridge?.()
          return flattenNode<Record<string, PropertyBuilder>>(node)
        })
        telemetry?.reportPerformance('react.useMutate.restore', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.restore.success', 1)
        trace?.end()
        return result
      } catch (err) {
        trace?.end()
        telemetry?.reportUsage('react.useMutate.restore.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.restore',
          nodeId: id
        })
        throw err
      }
    },
    [bridge, telemetry, tracing, withPending]
  )

  // Execute a transaction via DataBridge.transaction when the bridge supports
  // it; bridges without a transaction API run operations sequentially.
  const mutate = useCallback(
    async (ops: MutateOp[]): Promise<MutateResult | null> => {
      if (!bridge || ops.length === 0) return null

      const start = telemetry ? Date.now() : 0
      const trace = tracing?.startTrace('mutate', 'mutate:transaction')
      try {
        const result = await withPending(async () => {
          const endBridge = trace?.mark(TRACE_STAGES.mutateBridge)
          try {
            const canUseTransactions = typeof bridge.transaction === 'function'
            const usesTempIds = hasTempIdsInOps(ops)

            if (usesTempIds && !canUseTransactions) {
              throw new Error(
                'Temp IDs in useMutate.mutate() require a transaction-capable bridge (DataBridge.transaction). ' +
                  'Current bridge executes operations sequentially and cannot resolve temp IDs.'
              )
            }

            if (canUseTransactions) {
              const tx = await bridge.transaction!(toTransactionOperations(ops))
              return {
                results: tx.results,
                batchId: tx.batchId,
                tempIds: tx.tempIds
              }
            }

            const results: (NodeState | null)[] = []

            for (const op of ops) {
              switch (op.type) {
                case 'create': {
                  const node = await bridge.create(
                    op.schema,
                    op.data as Record<string, unknown>,
                    op.id
                  )
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
          } finally {
            endBridge?.()
          }
        })
        telemetry?.reportPerformance('react.useMutate.transaction', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.transaction.success', 1)
        trace?.end()
        return result
      } catch (err) {
        trace?.end()
        telemetry?.reportUsage('react.useMutate.transaction.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.transaction',
          opCount: ops.length
        })
        throw err
      }
    },
    [bridge, telemetry, tracing, withPending]
  )

  const bulk = useCallback(
    async (input: NodeBatchWriteInput): Promise<NodeBatchWriteResult | null> => {
      if (!bridge) return null

      const start = telemetry ? Date.now() : 0
      try {
        const result = await withPending(async () => bridge.bulkWrite(input))
        telemetry?.reportPerformance('react.useMutate.bulk', Date.now() - start)
        telemetry?.reportUsage('react.useMutate.bulk.success', 1)
        return result
      } catch (err) {
        telemetry?.reportUsage('react.useMutate.bulk.failure', 1)
        telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), {
          codeNamespace: 'react.useMutate.bulk',
          kind: input.kind
        })
        throw err
      }
    },
    [bridge, telemetry, withPending]
  )

  // Return a stable object so consumers that memoize on the whole mutate
  // result do not churn every render. The callbacks are useCallback-stable
  // and the pending getters read live ref values at access time, so a single
  // memoized object stays correct across pending transitions.
  return useMemo(
    () => ({
      create,
      update,
      remove,
      restore,
      mutate,
      bulk,
      // Lazy getters record how much pending detail this component reads, so
      // the external-store snapshot above can avoid re-rendering components
      // that never look at pending state.
      get isPending(): boolean {
        pendingReadLevelRef.current = Math.max(pendingReadLevelRef.current, 1)
        return pendingRef.current > 0
      },
      get pendingCount(): number {
        pendingReadLevelRef.current = 2
        return pendingRef.current
      }
    }),
    [create, update, remove, restore, mutate, bulk]
  )
}
