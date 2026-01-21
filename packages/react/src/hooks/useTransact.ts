/**
 * useTransact - Transaction hook for atomic multi-node operations
 *
 * Provides a store-level transaction API that works across schemas.
 *
 * @example
 * ```tsx
 * const { transact } = useTransact()
 *
 * // Create multiple nodes atomically
 * const result = await transact([
 *   { type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'Task 1' } },
 *   { type: 'create', schemaId: ProjectSchema._schemaId, properties: { name: 'Project' } },
 *   { type: 'update', nodeId: existingId, properties: { status: 'done' } },
 *   { type: 'delete', nodeId: oldTaskId },
 * ])
 *
 * // All operations succeed or fail together
 * console.log(result.batchId, result.changes)
 * ```
 */
import { useCallback } from 'react'
import type {
  TransactionOperation,
  TransactionResult,
  SchemaIRI,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps
} from '@xnet/data'
import { useNodeStore } from './useNodeStore'

// =============================================================================
// Types
// =============================================================================

/**
 * Create operation for transact
 */
export interface TransactCreate {
  type: 'create'
  schemaId: SchemaIRI
  properties: Record<string, unknown>
}

/**
 * Type-safe create operation using a schema
 */
export interface TransactCreateTyped<P extends Record<string, PropertyBuilder>> {
  type: 'create'
  schema: DefinedSchema<P>
  properties: InferCreateProps<P>
}

/**
 * Update operation for transact
 */
export interface TransactUpdate {
  type: 'update'
  nodeId: string
  properties: Record<string, unknown>
}

/**
 * Delete operation for transact
 */
export interface TransactDelete {
  type: 'delete'
  nodeId: string
}

/**
 * Restore operation for transact
 */
export interface TransactRestore {
  type: 'restore'
  nodeId: string
}

/**
 * All possible transact operations
 */
export type TransactOp =
  | TransactCreate
  | TransactCreateTyped<Record<string, PropertyBuilder>>
  | TransactUpdate
  | TransactDelete
  | TransactRestore

/**
 * Result from useTransact hook
 */
export interface UseTransactResult {
  /**
   * Execute multiple operations atomically as a transaction.
   * All operations succeed or fail together.
   */
  transact: (ops: TransactOp[]) => Promise<TransactionResult | null>
  /** Whether a transaction is in progress */
  isTransacting: boolean
  /** Any error from the last transaction */
  error: Error | null
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for executing atomic transactions across multiple nodes/schemas.
 *
 * Unlike useSchema().transaction which is bound to a single schema,
 * useTransact works at the store level and can operate on any nodes.
 *
 * @example
 * ```tsx
 * function BatchOperations() {
 *   const { transact } = useTransact()
 *
 *   const handleBatchCreate = async () => {
 *     await transact([
 *       { type: 'create', schema: TaskSchema, properties: { title: 'Task 1' } },
 *       { type: 'create', schema: TaskSchema, properties: { title: 'Task 2' } },
 *     ])
 *   }
 *
 *   const handleMoveToProject = async (taskIds: string[], projectId: string) => {
 *     await transact(
 *       taskIds.map(id => ({
 *         type: 'update',
 *         nodeId: id,
 *         properties: { projectId }
 *       }))
 *     )
 *   }
 * }
 * ```
 */
export function useTransact(): UseTransactResult {
  const { store, isReady } = useNodeStore()

  const transact = useCallback(
    async (ops: TransactOp[]): Promise<TransactionResult | null> => {
      if (!store || !isReady || ops.length === 0) return null

      // Convert TransactOp[] to TransactionOperation[]
      const storeOps: TransactionOperation[] = ops.map((op) => {
        switch (op.type) {
          case 'create': {
            // Check if it's a typed create (has schema) or raw create (has schemaId)
            const schemaId = 'schema' in op ? op.schema._schemaId : op.schemaId
            return {
              type: 'create' as const,
              options: {
                schemaId,
                properties: op.properties as Record<string, unknown>
              }
            }
          }
          case 'update':
            return {
              type: 'update' as const,
              nodeId: op.nodeId,
              options: { properties: op.properties }
            }
          case 'delete':
            return { type: 'delete' as const, nodeId: op.nodeId }
          case 'restore':
            return { type: 'restore' as const, nodeId: op.nodeId }
        }
      })

      return store.transaction(storeOps)
    },
    [store, isReady]
  )

  return {
    transact,
    // Note: These could be enhanced with state tracking if needed
    isTransacting: false,
    error: null
  }
}

// =============================================================================
// Helper: typed transact builder
// =============================================================================

/**
 * Helper to create a type-safe create operation for transact
 *
 * @example
 * ```tsx
 * const { transact } = useTransact()
 *
 * await transact([
 *   createOp(TaskSchema, { title: 'New Task', status: 'todo' }),
 *   createOp(ProjectSchema, { name: 'New Project' }),
 * ])
 * ```
 */
export function createOp<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  properties: InferCreateProps<P>
): TransactCreateTyped<P> {
  return { type: 'create', schema, properties }
}
