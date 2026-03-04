/**
 * useTableState - Hook for managing table state with TanStack Table
 */

import type { ViewConfig, ColumnMeta } from '../types.js'
import type { Schema, PropertyDefinition } from '@xnetjs/data'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnOrderState,
  type ColumnSizingState,
  type Table
} from '@tanstack/react-table'
import { useMemo, useState, useCallback } from 'react'
import { getPropertyHandler } from '../properties/index.js'

/**
 * A row in the table (generic node with properties)
 */
export interface TableRow {
  id: string
  [key: string]: unknown
}

/**
 * Options for useTableState hook
 */
export interface UseTableStateOptions {
  /** Schema defining the properties */
  schema: Schema
  /** Current view configuration */
  view: ViewConfig
  /** Data rows (nodes with flattened properties) */
  data: TableRow[]
  /** Callback when a cell value is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
}

/**
 * Result from useTableState hook
 */
export interface UseTableStateResult {
  /** TanStack Table instance */
  table: Table<TableRow>
  /** Current sorting state */
  sorting: SortingState
  /** Update sorting */
  setSorting: (sorting: SortingState) => void
  /** Current column filters */
  columnFilters: ColumnFiltersState
  /** Update column filters */
  setColumnFilters: (filters: ColumnFiltersState) => void
  /** Column visibility map */
  columnVisibility: VisibilityState
  /** Update column visibility */
  setColumnVisibility: (visibility: VisibilityState) => void
  /** Column order */
  columnOrder: ColumnOrderState
  /** Update column order */
  setColumnOrder: (order: ColumnOrderState) => void
  /** Column sizes */
  columnSizing: ColumnSizingState
}

/**
 * Create a column definition from a property definition
 */
function createColumnDef(
  property: PropertyDefinition,
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
): ColumnDef<TableRow> {
  const handler = getPropertyHandler(property.type)
  const propertyKey = property['@id'].split('#').pop() || property.name

  return {
    id: propertyKey,
    accessorFn: (row) => row[propertyKey],
    header: property.name,
    size: 150,
    minSize: 80,
    maxSize: 500,

    // Cell rendering handled by TableCell component
    cell: ({ getValue }) => getValue(),

    // Sorting
    sortingFn: (rowA, rowB, columnId) => {
      const a = rowA.getValue(columnId)
      const b = rowB.getValue(columnId)
      return handler.compare(a, b, property.config)
    },

    // Filtering
    filterFn: (row, columnId, filterValue) => {
      const value = row.getValue(columnId)
      if (!filterValue || typeof filterValue !== 'object') return true
      const { operator, value: filterVal } = filterValue as { operator: string; value: unknown }
      return handler.applyFilter(value, operator as never, filterVal)
    },

    // Meta for cell rendering
    meta: {
      property,
      handler,
      onUpdate: onUpdateRow
        ? (rowId: string, value: unknown) => onUpdateRow(rowId, propertyKey, value)
        : undefined
    } as ColumnMeta
  }
}

/**
 * Hook for managing table state with TanStack Table
 */
export function useTableState({
  schema,
  view,
  data,
  onUpdateRow,
  onUpdateView
}: UseTableStateOptions): UseTableStateResult {
  // Initialize sorting from view config
  const [sorting, setSorting] = useState<SortingState>(() =>
    view.sorts.map((s) => ({
      id: s.propertyId,
      desc: s.direction === 'desc'
    }))
  )

  // Column filters
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Column visibility from view config
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const visibility: VisibilityState = {}
    schema.properties.forEach((prop) => {
      const propKey = prop['@id'].split('#').pop() || prop.name
      visibility[propKey] = view.visibleProperties.includes(propKey)
    })
    return visibility
  })

  // Column order from view config
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(view.visibleProperties)

  // Column sizing from view config
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(view.propertyWidths || {})

  // Generate column definitions from schema
  const columns = useMemo<ColumnDef<TableRow>[]>(() => {
    return schema.properties.map((prop) => createColumnDef(prop, onUpdateRow))
  }, [schema.properties, onUpdateRow])

  // Handle column sizing changes
  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((old) => {
        const newSizing = typeof updater === 'function' ? updater(old) : updater
        // Persist to view config
        onUpdateView?.({ propertyWidths: newSizing })
        return newSizing
      })
    },
    [onUpdateView]
  )

  // Handle sorting changes
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting((old) => {
        const newSorting = typeof updater === 'function' ? updater(old) : updater
        // Persist to view config
        onUpdateView?.({
          sorts: newSorting.map((s) => ({
            propertyId: s.id,
            direction: s.desc ? 'desc' : 'asc'
          }))
        })
        return newSorting
      })
    },
    [onUpdateView]
  )

  // Create table instance
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing
    },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: handleColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true
  })

  return {
    table,
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    columnSizing
  }
}
