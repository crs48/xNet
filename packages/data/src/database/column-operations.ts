/**
 * Column CRUD operations for database columns.
 *
 * Columns are stored in the database's Y.Doc as a Y.Array of Y.Maps.
 * This enables CRDT-based ordering and real-time schema sync.
 */

import type { ColumnDefinition, ColumnType, ColumnConfig } from './column-types'
import { nanoid } from 'nanoid'
import * as Y from 'yjs'

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get all columns from a database doc.
 *
 * @example
 * ```typescript
 * const columns = getColumns(doc)
 * console.log(columns.map(c => c.name))
 * ```
 */
export function getColumns(doc: Y.Doc): ColumnDefinition[] {
  const columns = doc.getArray('columns')
  const result: ColumnDefinition[] = []

  columns.forEach((col) => {
    const colMap = col as Y.Map<unknown>
    result.push(columnMapToDefinition(colMap))
  })

  return result
}

/**
 * Get a single column by ID.
 *
 * @example
 * ```typescript
 * const column = getColumn(doc, 'abc123')
 * if (column) {
 *   console.log(column.name, column.type)
 * }
 * ```
 */
export function getColumn(doc: Y.Doc, columnId: string): ColumnDefinition | null {
  const columns = doc.getArray('columns')

  for (let i = 0; i < columns.length; i++) {
    const col = columns.get(i) as Y.Map<unknown>
    if (col.get('id') === columnId) {
      return columnMapToDefinition(col)
    }
  }

  return null
}

/**
 * Get the index of a column by ID.
 * Returns -1 if not found.
 */
export function getColumnIndex(doc: Y.Doc, columnId: string): number {
  const columns = doc.getArray('columns')

  for (let i = 0; i < columns.length; i++) {
    const col = columns.get(i) as Y.Map<unknown>
    if (col.get('id') === columnId) {
      return i
    }
  }

  return -1
}

/**
 * Get the title column from a database doc.
 * Returns null if no title column is defined.
 */
export function getTitleColumn(doc: Y.Doc): ColumnDefinition | null {
  const columns = doc.getArray('columns')

  for (let i = 0; i < columns.length; i++) {
    const col = columns.get(i) as Y.Map<unknown>
    if (col.get('isTitle') === true) {
      return columnMapToDefinition(col)
    }
  }

  return null
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new column.
 * Returns the new column ID.
 *
 * @example
 * ```typescript
 * const id = createColumn(doc, {
 *   name: 'Status',
 *   type: 'select',
 *   config: {
 *     options: [
 *       { id: 'todo', name: 'To Do', color: 'gray' },
 *       { id: 'done', name: 'Done', color: 'green' }
 *     ]
 *   }
 * })
 * ```
 */
export function createColumn(doc: Y.Doc, definition: Omit<ColumnDefinition, 'id'>): string {
  const columns = doc.getArray('columns')
  const columnId = nanoid()

  doc.transact(() => {
    const column = new Y.Map()
    column.set('id', columnId)
    column.set('name', definition.name)
    column.set('type', definition.type)
    column.set('config', definition.config ?? {})
    if (definition.width !== undefined) column.set('width', definition.width)
    if (definition.isTitle !== undefined) column.set('isTitle', definition.isTitle)

    columns.push([column])

    // Add to all views' visible columns
    const views = doc.getMap('views')
    views.forEach((view) => {
      const viewMap = view as Y.Map<unknown>
      const visible = viewMap.get('visibleColumns') as string[] | undefined
      if (visible) {
        viewMap.set('visibleColumns', [...visible, columnId])
      }
    })
  })

  return columnId
}

/**
 * Update a column's properties.
 *
 * @example
 * ```typescript
 * updateColumn(doc, 'abc123', { name: 'Project Status' })
 * ```
 */
export function updateColumn(
  doc: Y.Doc,
  columnId: string,
  updates: Partial<Omit<ColumnDefinition, 'id'>>
): void {
  const columns = doc.getArray('columns')

  doc.transact(() => {
    for (let i = 0; i < columns.length; i++) {
      const col = columns.get(i) as Y.Map<unknown>
      if (col.get('id') === columnId) {
        if (updates.name !== undefined) col.set('name', updates.name)
        if (updates.type !== undefined) col.set('type', updates.type)
        if (updates.config !== undefined) col.set('config', updates.config)
        if (updates.width !== undefined) col.set('width', updates.width)
        if (updates.isTitle !== undefined) col.set('isTitle', updates.isTitle)
        break
      }
    }
  })
}

/**
 * Delete a column.
 * Also removes the column from all views' visible columns.
 *
 * @example
 * ```typescript
 * deleteColumn(doc, 'abc123')
 * ```
 */
export function deleteColumn(doc: Y.Doc, columnId: string): void {
  const columns = doc.getArray('columns')

  doc.transact(() => {
    // Find and remove column
    for (let i = 0; i < columns.length; i++) {
      const col = columns.get(i) as Y.Map<unknown>
      if (col.get('id') === columnId) {
        columns.delete(i, 1)
        break
      }
    }

    // Remove from all views' visible columns
    const views = doc.getMap('views')
    views.forEach((view) => {
      const viewMap = view as Y.Map<unknown>
      const visible = viewMap.get('visibleColumns') as string[] | undefined
      if (visible) {
        viewMap.set(
          'visibleColumns',
          visible.filter((id) => id !== columnId)
        )
      }
    })
  })
}

/**
 * Reorder a column to a new position.
 *
 * @example
 * ```typescript
 * // Move column to the beginning
 * reorderColumn(doc, 'abc123', 0)
 * ```
 */
export function reorderColumn(doc: Y.Doc, columnId: string, newIndex: number): void {
  const columns = doc.getArray('columns')

  doc.transact(() => {
    // Find current index
    let currentIndex = -1
    let columnData: Y.Map<unknown> | null = null

    for (let i = 0; i < columns.length; i++) {
      const col = columns.get(i) as Y.Map<unknown>
      if (col.get('id') === columnId) {
        currentIndex = i
        columnData = col
        break
      }
    }

    if (currentIndex === -1 || columnData === null) return
    if (currentIndex === newIndex) return

    // Clamp newIndex to valid range
    const clampedIndex = Math.max(0, Math.min(newIndex, columns.length - 1))

    // Y.Array doesn't have a move operation, so we need to:
    // 1. Clone the column data
    // 2. Delete from current position
    // 3. Insert at new position

    // Clone the column data
    const clonedColumn = new Y.Map()
    columnData.forEach((value, key) => {
      clonedColumn.set(key, value)
    })

    // Delete from current position
    columns.delete(currentIndex, 1)

    // Adjust target index if we deleted before it
    const adjustedIndex = currentIndex < clampedIndex ? clampedIndex : clampedIndex

    // Insert at new position
    columns.insert(adjustedIndex, [clonedColumn])
  })
}

/**
 * Duplicate a column.
 * Returns the new column ID.
 *
 * @example
 * ```typescript
 * const newId = duplicateColumn(doc, 'abc123', 'Status (Copy)')
 * ```
 */
export function duplicateColumn(doc: Y.Doc, columnId: string, newName?: string): string | null {
  const column = getColumn(doc, columnId)
  if (!column) return null

  return createColumn(doc, {
    name: newName ?? `${column.name} (Copy)`,
    type: column.type,
    config: column.config,
    width: column.width
    // Don't copy isTitle - only one title column allowed
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Y.Map to a ColumnDefinition.
 */
function columnMapToDefinition(col: Y.Map<unknown>): ColumnDefinition {
  return {
    id: col.get('id') as string,
    name: col.get('name') as string,
    type: col.get('type') as ColumnType,
    config: (col.get('config') as ColumnConfig) ?? {},
    width: col.get('width') as number | undefined,
    isTitle: col.get('isTitle') as boolean | undefined
  }
}
