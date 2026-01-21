/**
 * useBoardState - Hook for managing board (Kanban) state
 */

import { useMemo, useState, useCallback } from 'react'
import type { Schema, PropertyDefinition } from '@xnet/data'
import type { ViewConfig } from '../types.js'

/**
 * A row in the board (generic node with properties)
 */
export interface BoardRow {
  id: string
  [key: string]: unknown
}

/**
 * Select option from property config
 */
interface SelectOption {
  id: string
  name: string
  color?: string
}

/**
 * A column in the board view
 */
export interface BoardColumn {
  id: string
  name: string
  color: string
  items: BoardRow[]
  collapsed: boolean
}

/**
 * Options for useBoardState hook
 */
export interface UseBoardStateOptions {
  /** Schema defining the properties */
  schema: Schema
  /** Current view configuration */
  view: ViewConfig
  /** Data rows (nodes with flattened properties) */
  data: BoardRow[]
  /** Callback when a row value is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
}

/**
 * Result from useBoardState hook
 */
export interface UseBoardStateResult {
  /** Board columns with grouped items */
  columns: BoardColumn[]
  /** The property used for grouping */
  groupByProperty: PropertyDefinition | undefined
  /** Move a card from one column to another */
  moveCard: (itemId: string, fromColumnId: string, toColumnId: string) => void
  /** Toggle column collapse state */
  toggleColumnCollapse: (columnId: string) => void
  /** Collapsed column IDs */
  collapsedColumns: Set<string>
}

/**
 * Hook for managing board state
 */
export function useBoardState({
  schema,
  view,
  data,
  onUpdateRow
}: UseBoardStateOptions): UseBoardStateResult {
  // Track collapsed columns
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set())

  // Get the group-by property
  const groupByProperty = useMemo(() => {
    if (!view.groupByProperty) return undefined
    return schema.properties.find((p) => {
      const propKey = p['@id'].split('#').pop() || p.name
      return propKey === view.groupByProperty
    })
  }, [schema.properties, view.groupByProperty])

  // Group items by property value
  const columns = useMemo<BoardColumn[]>(() => {
    if (!groupByProperty) {
      // No grouping property - return all items in a single column
      return [
        {
          id: '__all__',
          name: 'All items',
          color: '#e0e0e0',
          items: data,
          collapsed: collapsedColumns.has('__all__')
        }
      ]
    }

    // Only support select/multiSelect for grouping
    if (groupByProperty.type !== 'select' && groupByProperty.type !== 'multiSelect') {
      return [
        {
          id: '__all__',
          name: 'All items',
          color: '#e0e0e0',
          items: data,
          collapsed: collapsedColumns.has('__all__')
        }
      ]
    }

    const options = (groupByProperty.config?.options as SelectOption[]) ?? []
    const propertyKey = groupByProperty['@id'].split('#').pop() || groupByProperty.name
    const columnMap = new Map<string, BoardRow[]>()

    // Initialize columns from options
    options.forEach((opt) => {
      columnMap.set(opt.id, [])
    })

    // Add "No value" column
    columnMap.set('__none__', [])

    // Group items
    data.forEach((item) => {
      const value = item[propertyKey]

      if (groupByProperty.type === 'multiSelect' && Array.isArray(value)) {
        // Multi-select: item appears in multiple columns
        if (value.length === 0) {
          columnMap.get('__none__')?.push(item)
        } else {
          value.forEach((v) => {
            const col = columnMap.get(v)
            if (col) col.push(item)
          })
        }
      } else if (typeof value === 'string') {
        // Single select
        const col = columnMap.get(value)
        if (col) col.push(item)
        else columnMap.get('__none__')?.push(item)
      } else {
        // No value
        columnMap.get('__none__')?.push(item)
      }
    })

    // Build column array
    const cols: BoardColumn[] = []

    // Add "No value" column first if it has items
    const noValueItems = columnMap.get('__none__') || []
    if (noValueItems.length > 0) {
      cols.push({
        id: '__none__',
        name: 'No value',
        color: '#9ca3af',
        items: noValueItems,
        collapsed: collapsedColumns.has('__none__')
      })
    }

    // Add option columns in order
    options.forEach((opt) => {
      const colItems = columnMap.get(opt.id) || []
      cols.push({
        id: opt.id,
        name: opt.name,
        color: opt.color || '#e0e0e0',
        items: colItems,
        collapsed: collapsedColumns.has(opt.id)
      })
    })

    return cols
  }, [data, groupByProperty, collapsedColumns])

  // Handle card move between columns
  const moveCard = useCallback(
    (itemId: string, fromColumnId: string, toColumnId: string) => {
      if (!groupByProperty || !onUpdateRow) return
      if (fromColumnId === toColumnId) return

      const propertyKey = groupByProperty['@id'].split('#').pop() || groupByProperty.name
      const newValue = toColumnId === '__none__' ? null : toColumnId

      if (groupByProperty.type === 'multiSelect') {
        // For multi-select, update the array
        const item = data.find((i) => i.id === itemId)
        if (!item) return

        const currentValues = (item[propertyKey] as string[]) || []

        // Remove from old column, add to new
        let newValues = currentValues.filter((v) => v !== fromColumnId)
        if (newValue) {
          newValues = [...newValues, newValue]
        }

        onUpdateRow(itemId, propertyKey, newValues)
      } else {
        // Single select: just set the new value
        onUpdateRow(itemId, propertyKey, newValue)
      }
    },
    [groupByProperty, data, onUpdateRow]
  )

  // Toggle column collapse
  const toggleColumnCollapse = useCallback((columnId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      return next
    })
  }, [])

  return {
    columns,
    groupByProperty,
    moveCard,
    toggleColumnCollapse,
    collapsedColumns
  }
}
