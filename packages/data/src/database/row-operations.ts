/**
 * Row CRUD operations for database rows.
 *
 * These functions provide a high-level API for creating, updating,
 * and querying database rows. They handle:
 * - Cell value storage with column ID prefixes
 * - Sort key generation for row ordering
 * - Database row count maintenance
 */

import type { CellValue } from './cell-types'
import type { NodeStore } from '../store/store'
import type { NodeState } from '../store/types'
import { DatabaseRowSchema } from '../schema/schemas/database-row'
import { cellKey, toCellProperties, fromCellProperties } from './cell-types'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Options for creating a new row.
 */
export interface CreateRowOptions {
  /** Parent database ID */
  databaseId: string

  /** Initial cell values (columnId -> value) */
  cells?: Record<string, CellValue>

  /**
   * Insert position: before this row's sortKey.
   * If neither before nor after is specified, appends to end.
   */
  before?: string

  /**
   * Insert position: after this row's sortKey.
   * If neither before nor after is specified, appends to end.
   */
  after?: string
}

/**
 * Options for querying rows.
 */
export interface QueryRowsOptions {
  /** Maximum number of rows to return */
  limit?: number

  /** Cursor for pagination (sortKey of last row from previous page) */
  cursor?: string

  /** Property to sort by (default: 'sortKey') */
  sortBy?: string

  /** Sort direction (default: 'asc') */
  sortDirection?: 'asc' | 'desc'
}

/**
 * Result of a row query.
 */
export interface QueryRowsResult {
  /** The rows matching the query */
  rows: DatabaseRowNode[]

  /** Cursor for the next page (undefined if no more rows) */
  cursor?: string

  /** Whether there are more rows after this page */
  hasMore: boolean
}

/**
 * A database row node with extracted cell values.
 */
export interface DatabaseRowNode extends NodeState {
  /** Extracted cell values (columnId -> value) */
  cells: Record<string, CellValue>
}

// ─── Row Operations ──────────────────────────────────────────────────────────

/**
 * Create a new row in a database.
 *
 * @example
 * ```typescript
 * const rowId = await createRow(store, {
 *   databaseId: 'db_abc123',
 *   cells: {
 *     name: 'John Doe',
 *     status: 'active',
 *     priority: 3
 *   }
 * })
 * ```
 */
export async function createRow(store: NodeStore, options: CreateRowOptions): Promise<string> {
  const { databaseId, cells = {}, before, after } = options

  // Generate sort key for position
  // For now, use a simple timestamp-based key
  // TODO: Replace with proper fractional indexing in task 02
  const sortKey = generateSortKey(before, after)

  // Convert cell values to prefixed properties
  const dynamicProperties = toCellProperties(cells)

  // Create the row node
  const node = await store.create({
    schemaId: DatabaseRowSchema.schema['@id'],
    properties: {
      database: databaseId,
      sortKey,
      ...dynamicProperties
    }
  })

  // Update database row count
  await incrementRowCount(store, databaseId)

  return node.id
}

/**
 * Update a single cell value in a row.
 *
 * @example
 * ```typescript
 * await updateCell(store, rowId, 'status', 'completed')
 * ```
 */
export async function updateCell(
  store: NodeStore,
  rowId: string,
  columnId: string,
  value: CellValue
): Promise<void> {
  await store.update(rowId, {
    properties: {
      [cellKey(columnId)]: value
    }
  })
}

/**
 * Update multiple cell values in a row.
 *
 * @example
 * ```typescript
 * await updateCells(store, rowId, {
 *   name: 'Jane Doe',
 *   status: 'active'
 * })
 * ```
 */
export async function updateCells(
  store: NodeStore,
  rowId: string,
  cells: Record<string, CellValue>
): Promise<void> {
  const dynamicProperties = toCellProperties(cells)
  await store.update(rowId, {
    properties: dynamicProperties
  })
}

/**
 * Delete a row from a database.
 *
 * @example
 * ```typescript
 * await deleteRow(store, rowId)
 * ```
 */
export async function deleteRow(store: NodeStore, rowId: string): Promise<void> {
  const row = await store.get(rowId)
  if (!row) return

  const databaseId = row.properties.database as string

  await store.delete(rowId)

  // Update database row count
  await decrementRowCount(store, databaseId)
}

/**
 * Get a single row by ID with extracted cell values.
 *
 * @example
 * ```typescript
 * const row = await getRow(store, rowId)
 * console.log(row.cells.name) // 'John Doe'
 * ```
 */
export async function getRow(store: NodeStore, rowId: string): Promise<DatabaseRowNode | null> {
  const node = await store.get(rowId)
  if (!node) return null

  return {
    ...node,
    cells: fromCellProperties(node.properties)
  }
}

/**
 * Query rows for a database with pagination.
 *
 * @example
 * ```typescript
 * const { rows, hasMore, cursor } = await queryRows(store, databaseId, {
 *   limit: 50
 * })
 *
 * // Get next page
 * if (hasMore) {
 *   const nextPage = await queryRows(store, databaseId, {
 *     limit: 50,
 *     cursor
 *   })
 * }
 * ```
 */
export async function queryRows(
  store: NodeStore,
  databaseId: string,
  options?: QueryRowsOptions
): Promise<QueryRowsResult> {
  const { limit = 50, cursor, sortDirection = 'asc' } = options ?? {}

  // Get all rows for this database
  const allRows = await store.list({
    schemaId: DatabaseRowSchema.schema['@id']
  })

  // Filter by database ID
  let rows = allRows.filter((row) => row.properties.database === databaseId)

  // Sort by sortKey
  rows.sort((a, b) => {
    const aKey = a.properties.sortKey as string
    const bKey = b.properties.sortKey as string
    const cmp = aKey.localeCompare(bKey)
    return sortDirection === 'asc' ? cmp : -cmp
  })

  // Apply cursor (pagination)
  if (cursor) {
    const cursorIndex = rows.findIndex((row) => row.properties.sortKey === cursor)
    if (cursorIndex !== -1) {
      rows = rows.slice(cursorIndex + 1)
    }
  }

  // Check if there are more rows
  const hasMore = rows.length > limit
  if (hasMore) {
    rows = rows.slice(0, limit)
  }

  // Get next cursor
  const nextCursor =
    hasMore && rows.length > 0 ? (rows[rows.length - 1].properties.sortKey as string) : undefined

  // Convert to DatabaseRowNode with extracted cells
  const rowNodes: DatabaseRowNode[] = rows.map((row) => ({
    ...row,
    cells: fromCellProperties(row.properties)
  }))

  return {
    rows: rowNodes,
    cursor: nextCursor,
    hasMore
  }
}

/**
 * Move a row to a new position.
 *
 * @example
 * ```typescript
 * // Move row between two other rows
 * await moveRow(store, rowId, {
 *   after: 'row_abc',
 *   before: 'row_xyz'
 * })
 * ```
 */
export async function moveRow(
  store: NodeStore,
  rowId: string,
  position: { before?: string; after?: string }
): Promise<void> {
  const sortKey = generateSortKey(position.before, position.after)
  await store.update(rowId, {
    properties: { sortKey }
  })
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Generate a sort key for a row position.
 *
 * This is a temporary implementation using timestamps.
 * TODO: Replace with proper fractional indexing in task 02.
 */
function generateSortKey(before?: string, after?: string): string {
  if (!before && !after) {
    // Append to end: use current timestamp
    return Date.now().toString(36).padStart(10, '0')
  }

  if (before && after) {
    // Insert between: find midpoint
    // This is a naive implementation that will be replaced
    const beforeNum = parseInt(before, 36)
    const afterNum = parseInt(after, 36)
    const mid = Math.floor((beforeNum + afterNum) / 2)
    return mid.toString(36).padStart(10, '0')
  }

  if (after) {
    // Insert after: add small increment
    const afterNum = parseInt(after, 36)
    return (afterNum + 1).toString(36).padStart(10, '0')
  }

  if (before) {
    // Insert before: subtract small increment
    const beforeNum = parseInt(before, 36)
    return (beforeNum - 1).toString(36).padStart(10, '0')
  }

  // Fallback
  return Date.now().toString(36).padStart(10, '0')
}

/**
 * Increment the row count for a database.
 */
async function incrementRowCount(store: NodeStore, databaseId: string): Promise<void> {
  const db = await store.get(databaseId)
  if (!db) return

  const currentCount = (db.properties.rowCount as number) ?? 0
  await store.update(databaseId, {
    properties: { rowCount: currentCount + 1 }
  })
}

/**
 * Decrement the row count for a database.
 */
async function decrementRowCount(store: NodeStore, databaseId: string): Promise<void> {
  const db = await store.get(databaseId)
  if (!db) return

  const currentCount = (db.properties.rowCount as number) ?? 0
  await store.update(databaseId, {
    properties: { rowCount: Math.max(0, currentCount - 1) }
  })
}
