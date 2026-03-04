/**
 * useDatabaseRow - Hook for single row operations with optimistic updates
 *
 * Provides:
 * - Row data with cell values
 * - Y.Doc for rich text cells
 * - Optimistic updates
 * - Delete operation
 *
 * @example
 * ```tsx
 * const {
 *   row,
 *   doc,
 *   update,
 *   delete: deleteRow,
 *   loading
 * } = useDatabaseRow(rowId)
 * ```
 */

import type { CellValue } from '@xnetjs/data'
import { getRow, updateCells, deleteRow as deleteRowOp } from '@xnetjs/data'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DatabaseRowData {
  /** Row ID */
  id: string

  /** Database ID this row belongs to */
  databaseId: string

  /** Sort key for ordering */
  sortKey: string

  /** Cell values keyed by column ID */
  cells: Record<string, CellValue>

  /** Creation timestamp */
  createdAt: number

  /** Creator DID */
  createdBy: string
}

export interface UseDatabaseRowResult {
  /** Row data */
  row: DatabaseRowData | null

  /** Y.Doc for rich text cells (if any) */
  doc: Y.Doc | null

  /** Update cell values (with optimistic UI) */
  update: (values: Record<string, CellValue>) => Promise<void>

  /** Delete this row */
  delete: () => Promise<void>

  /** Loading state */
  loading: boolean

  /** Error state */
  error: Error | null
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for single row operations with optimistic updates.
 */
export function useDatabaseRow(rowId: string): UseDatabaseRowResult {
  const { store, isReady } = useNodeStore()

  const [row, setRow] = useState<DatabaseRowData | null>(null)
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Optimistic update cache
  const optimisticRef = useRef<Record<string, CellValue>>({})

  // Keep store ref for callbacks
  const storeRef = useRef(store)
  storeRef.current = store

  // Load row
  useEffect(() => {
    if (!store || !isReady || !rowId) {
      setRow(null)
      setDoc(null)
      setLoading(false)
      return
    }

    let mounted = true

    const load = async () => {
      try {
        setLoading(true)
        const node = await getRow(store, rowId)

        if (!mounted) return

        if (node) {
          setRow({
            id: node.id,
            databaseId: node.properties.database as string,
            sortKey: node.properties.sortKey as string,
            cells: node.cells,
            createdAt: node.createdAt,
            createdBy: node.createdBy
          })

          // Load row doc if exists (for rich text cells)
          const storedContent = await store.getDocumentContent(rowId)
          if (storedContent && storedContent.length > 0) {
            const ydoc = new Y.Doc({ guid: rowId, gc: false })
            Y.applyUpdate(ydoc, storedContent)
            setDoc(ydoc)
          }
        } else {
          setRow(null)
          setDoc(null)
        }

        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    // Subscribe to changes
    const unsubscribe = store.subscribe((event) => {
      if (event.change.payload.nodeId === rowId) {
        load()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [store, isReady, rowId])

  // Update with optimistic UI
  const handleUpdate = useCallback(
    async (values: Record<string, CellValue>): Promise<void> => {
      if (!storeRef.current) throw new Error('Store not ready')

      // Apply optimistic update
      optimisticRef.current = { ...optimisticRef.current, ...values }
      setRow((prev) =>
        prev
          ? {
              ...prev,
              cells: { ...prev.cells, ...values }
            }
          : null
      )

      try {
        await updateCells(storeRef.current, rowId, values)
        // Clear optimistic cache on success
        for (const key of Object.keys(values)) {
          delete optimisticRef.current[key]
        }
      } catch (err) {
        // Revert optimistic update on error
        setRow((prev) => {
          if (!prev) return null
          const reverted = { ...prev.cells }
          for (const key of Object.keys(values)) {
            delete reverted[key]
          }
          return { ...prev, cells: reverted }
        })
        throw err
      }
    },
    [rowId]
  )

  // Delete
  const handleDelete = useCallback(async (): Promise<void> => {
    if (!storeRef.current) throw new Error('Store not ready')
    await deleteRowOp(storeRef.current, rowId)
  }, [rowId])

  return {
    row,
    doc,
    update: handleUpdate,
    delete: handleDelete,
    loading,
    error
  }
}
