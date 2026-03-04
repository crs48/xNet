/**
 * useRelatedRows - Hook for loading related row data for relation columns
 *
 * Fetches the row data for a list of row IDs, typically from a relation column.
 *
 * @example
 * ```tsx
 * const { rows, loading, error } = useRelatedRows(['row1', 'row2'])
 * // rows contains the full row data for display
 * ```
 */

import type { DatabaseRow } from './useDatabase'
import { fromCellProperties } from '@xnetjs/data'
import { useState, useEffect, useMemo } from 'react'
import { useNodeStore } from './useNodeStore'

export interface UseRelatedRowsResult {
  /** Loaded row data */
  rows: DatabaseRow[]
  /** Whether rows are loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
}

/**
 * Hook for loading related row data.
 *
 * @param rowIds - Array of row IDs to load
 * @returns Object containing rows, loading state, and error
 */
export function useRelatedRows(rowIds: string[]): UseRelatedRowsResult {
  const { store, isReady } = useNodeStore()
  const [rows, setRows] = useState<DatabaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Stable reference for row IDs to avoid unnecessary refetches
  const idsKey = useMemo(() => rowIds.join(','), [rowIds])

  useEffect(() => {
    if (!store || !isReady) return

    if (rowIds.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchRows = async () => {
      try {
        setLoading(true)

        // Fetch all rows in parallel
        const results = await Promise.all(
          rowIds.map(async (id) => {
            try {
              return await store.get(id)
            } catch {
              // Row may not exist or be inaccessible
              return null
            }
          })
        )

        if (!cancelled) {
          // Filter out nulls and convert to DatabaseRow format
          const loadedRows = results
            .filter((node): node is NonNullable<typeof node> => node !== null)
            .map((node) => nodeToRow(node))

          setRows(loadedRows)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchRows()

    return () => {
      cancelled = true
    }
  }, [store, isReady, idsKey, rowIds])

  return { rows, loading, error }
}

/**
 * Convert a NodeState to a DatabaseRow.
 */
function nodeToRow(node: {
  id: string
  properties: Record<string, unknown>
  createdAt: number
  createdBy: string
}): DatabaseRow {
  const cells = fromCellProperties(node.properties)

  return {
    id: node.id,
    sortKey: (node.properties.sortKey as string) ?? '',
    cells,
    createdAt: node.createdAt,
    createdBy: node.createdBy
  }
}
