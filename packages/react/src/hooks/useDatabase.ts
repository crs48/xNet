/**
 * useDatabase - Hook for database row operations with pagination
 *
 * Provides:
 * - Paginated row queries
 * - Row CRUD operations
 * - Integration with useDatabaseDoc for columns/views
 *
 * @example
 * ```tsx
 * const {
 *   rows,
 *   columns,
 *   views,
 *   loading,
 *   hasMore,
 *   loadMore,
 *   createRow,
 *   updateRow,
 *   deleteRow
 * } = useDatabase(databaseId)
 * ```
 */

import type { ColumnDefinition, ViewConfig, FilterGroup, SortConfig, CellValue } from '@xnetjs/data'
import {
  queryRows,
  createRow as createRowOp,
  updateCells,
  deleteRow as deleteRowOp,
  moveRow,
  fromCellProperties,
  filterRows,
  sortRows
} from '@xnetjs/data'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDatabaseDoc } from './useDatabaseDoc'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseDatabaseOptions {
  /** Active view ID (uses first view if not specified) */
  view?: string

  /** Override view filters */
  filters?: FilterGroup

  /** Override view sorts */
  sorts?: SortConfig[]

  /** Search query (full-text search) - not yet implemented */
  search?: string

  /** Page size (default: 50) */
  pageSize?: number
}

export interface DatabaseRow {
  /** Row ID */
  id: string

  /** Sort key for ordering */
  sortKey: string

  /** Cell values keyed by column ID */
  cells: Record<string, CellValue>

  /** Creation timestamp */
  createdAt: number

  /** Creator DID */
  createdBy: string
}

export interface UseDatabaseResult {
  // Database metadata
  /** Column definitions */
  columns: ColumnDefinition[]

  /** View configurations */
  views: ViewConfig[]

  // Row data (paginated)
  /** Loaded rows */
  rows: DatabaseRow[]

  /** Total row count */
  total: number

  /** Whether more rows are available */
  hasMore: boolean

  /** Load more rows */
  loadMore: () => Promise<void>

  // Current view
  /** Active view configuration */
  activeView: ViewConfig | null

  /** Set the active view */
  setActiveView: (viewId: string) => void

  // Row mutations
  /** Create a new row */
  createRow: (values?: Record<string, CellValue>) => Promise<string>

  /** Update a row's cell values */
  updateRow: (rowId: string, values: Record<string, CellValue>) => Promise<void>

  /** Delete a row */
  deleteRow: (rowId: string) => Promise<void>

  /** Reorder a row */
  reorderRow: (rowId: string, before?: string, after?: string) => Promise<void>

  /** Delete multiple rows */
  deleteRows: (rowIds: string[]) => Promise<void>

  // Query state
  /** Whether initially loading */
  loading: boolean

  /** Whether loading more rows */
  loadingMore: boolean

  /** Any error that occurred */
  error: Error | null

  /** Refetch all rows */
  refetch: () => Promise<void>
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for database row operations with pagination.
 */
export function useDatabase(
  databaseId: string,
  options: UseDatabaseOptions = {}
): UseDatabaseResult {
  const { store, isReady } = useNodeStore()
  const { columns, views } = useDatabaseDoc(databaseId)

  const [rows, setRows] = useState<DatabaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [activeViewId, setActiveViewId] = useState(options.view)

  const { pageSize = 50, filters, sorts, search } = options

  // Keep store ref for callbacks
  const storeRef = useRef(store)
  storeRef.current = store

  // Get active view config
  const activeView = useMemo(() => {
    if (activeViewId) {
      return views.find((v) => v.id === activeViewId) ?? null
    }
    return views[0] ?? null
  }, [views, activeViewId])

  // Merge options with view config
  const effectiveFilters = filters ?? activeView?.filters ?? null
  const effectiveSorts = sorts ?? activeView?.sorts ?? []

  // Query rows
  const fetchRows = useCallback(
    async (reset = true) => {
      if (!store || !isReady) return

      try {
        if (reset) {
          setLoading(true)
          setCursor(undefined)
        } else {
          setLoadingMore(true)
        }

        const result = await queryRows(store, databaseId, {
          limit: pageSize * 10, // Fetch more for client-side filtering
          cursor: reset ? undefined : cursor
        })

        // Parse rows
        let parsedRows = result.rows.map((node) => nodeToRow(node, columns))

        // Apply client-side filtering if filters are specified
        if (effectiveFilters && effectiveFilters.conditions.length > 0) {
          parsedRows = filterRows(parsedRows, columns, effectiveFilters)
        }

        // Apply client-side sorting if sorts are specified
        if (effectiveSorts.length > 0) {
          parsedRows = sortRows(parsedRows, columns, effectiveSorts)
        }

        // Apply pagination after filtering/sorting
        parsedRows = parsedRows.slice(0, pageSize)

        if (reset) {
          setRows(parsedRows)
        } else {
          setRows((prev) => [...prev, ...parsedRows])
        }

        setTotal(parsedRows.length)
        setCursor(result.cursor)
        setHasMore(result.hasMore)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [store, isReady, databaseId, pageSize, cursor, columns]
  )

  // Initial fetch when columns are loaded
  useEffect(() => {
    if (columns.length > 0) {
      fetchRows(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, columns.length])

  // Refetch when filters/sorts change
  useEffect(() => {
    if (columns.length > 0) {
      fetchRows(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilters, effectiveSorts, search])

  // Subscribe to row changes
  useEffect(() => {
    if (!store) return

    const unsubscribe = store.subscribe((event) => {
      const node = event.node

      // Check if this is a row in our database
      if (node?.schemaId === 'xnet://xnet.fyi/DatabaseRow') {
        const dbId = node.properties.database as string
        if (dbId === databaseId) {
          // Refetch on changes
          fetchRows(true)
        }
      }
    })

    return unsubscribe
  }, [store, databaseId, fetchRows])

  // Load more
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    await fetchRows(false)
  }, [hasMore, loadingMore, fetchRows])

  // Create row
  const handleCreateRow = useCallback(
    async (values?: Record<string, CellValue>): Promise<string> => {
      if (!storeRef.current) throw new Error('Store not ready')

      const lastRow = rows[rows.length - 1]

      const rowId = await createRowOp(storeRef.current, {
        databaseId,
        cells: values ?? {},
        after: lastRow?.sortKey
      })

      return rowId
    },
    [databaseId, rows]
  )

  // Update row
  const handleUpdateRow = useCallback(
    async (rowId: string, values: Record<string, CellValue>): Promise<void> => {
      if (!storeRef.current) throw new Error('Store not ready')
      await updateCells(storeRef.current, rowId, values)
    },
    []
  )

  // Delete row
  const handleDeleteRow = useCallback(async (rowId: string): Promise<void> => {
    if (!storeRef.current) throw new Error('Store not ready')
    await deleteRowOp(storeRef.current, rowId)
  }, [])

  // Reorder row
  const handleReorderRow = useCallback(
    async (rowId: string, before?: string, after?: string): Promise<void> => {
      if (!storeRef.current) throw new Error('Store not ready')
      await moveRow(storeRef.current, rowId, { before, after })
    },
    []
  )

  // Delete multiple rows
  const handleDeleteRows = useCallback(async (rowIds: string[]): Promise<void> => {
    if (!storeRef.current) throw new Error('Store not ready')
    await Promise.all(rowIds.map((id) => deleteRowOp(storeRef.current!, id)))
  }, [])

  return {
    columns,
    views,
    rows,
    total,
    hasMore,
    loadMore,
    activeView,
    setActiveView: setActiveViewId,
    createRow: handleCreateRow,
    updateRow: handleUpdateRow,
    deleteRow: handleDeleteRow,
    reorderRow: handleReorderRow,
    deleteRows: handleDeleteRows,
    loading,
    loadingMore,
    error,
    refetch: () => fetchRows(true)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a NodeState to a DatabaseRow.
 */
function nodeToRow(
  node: { id: string; properties: Record<string, unknown>; createdAt: number; createdBy: string },
  _columns: ColumnDefinition[]
): DatabaseRow {
  // Extract cell values from properties
  const cells = fromCellProperties(node.properties)

  return {
    id: node.id,
    sortKey: node.properties.sortKey as string,
    cells,
    createdAt: node.createdAt,
    createdBy: node.createdBy
  }
}

// Re-export types
export type { CellValue, FilterGroup, SortConfig }
