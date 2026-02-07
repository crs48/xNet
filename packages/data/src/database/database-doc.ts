/**
 * Database Y.Doc initialization and management.
 *
 * The database's Y.Doc contains:
 * - columns: Y.Array of column definitions
 * - views: Y.Map of view configurations
 * - meta: Y.Map of metadata (row count cache, etc.)
 */

import { nanoid } from 'nanoid'
import * as Y from 'yjs'

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize the Y.Doc structure for a new database.
 * Creates the columns array, views map, and meta map if they don't exist.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc()
 * initializeDatabaseDoc(doc)
 * ```
 */
export function initializeDatabaseDoc(doc: Y.Doc): void {
  doc.transact(() => {
    // Create columns array if not exists
    if (!doc.share.has('columns')) {
      doc.getArray('columns')
    }

    // Create views map if not exists
    if (!doc.share.has('views')) {
      doc.getMap('views')
    }

    // Create meta map if not exists
    if (!doc.share.has('meta')) {
      doc.getMap('meta')
    }
  })
}

/**
 * Check if a Y.Doc has been initialized as a database doc.
 */
export function isDatabaseDocInitialized(doc: Y.Doc): boolean {
  return doc.share.has('columns') && doc.share.has('views') && doc.share.has('meta')
}

// ─── Default Setup ────────────────────────────────────────────────────────────

/**
 * Add a default title column to a new database.
 * Returns the column ID.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc()
 * initializeDatabaseDoc(doc)
 * const titleColumnId = addDefaultTitleColumn(doc)
 * ```
 */
export function addDefaultTitleColumn(doc: Y.Doc): string {
  const columns = doc.getArray('columns')
  const columnId = nanoid()

  doc.transact(() => {
    const column = new Y.Map()
    column.set('id', columnId)
    column.set('name', 'Title')
    column.set('type', 'text')
    column.set('config', {})
    column.set('isTitle', true)
    column.set('width', 300)

    columns.push([column])
  })

  return columnId
}

/**
 * Add a default table view to a new database.
 * Returns the view ID.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc()
 * initializeDatabaseDoc(doc)
 * addDefaultTitleColumn(doc)
 * const viewId = addDefaultTableView(doc)
 * ```
 */
export function addDefaultTableView(doc: Y.Doc): string {
  const views = doc.getMap('views')
  const columns = doc.getArray('columns')
  const viewId = nanoid()

  doc.transact(() => {
    // Get all column IDs for visibility
    const visibleColumns: string[] = []
    columns.forEach((col) => {
      const colMap = col as Y.Map<unknown>
      visibleColumns.push(colMap.get('id') as string)
    })

    const view = new Y.Map()
    view.set('id', viewId)
    view.set('name', 'Default View')
    view.set('type', 'table')
    view.set('visibleColumns', visibleColumns)
    view.set('filters', null)
    view.set('sorts', [])
    view.set('groupBy', null)

    views.set(viewId, view)
  })

  return viewId
}

/**
 * Set up a new database with default title column and table view.
 * Returns the column ID and view ID.
 *
 * @example
 * ```typescript
 * const doc = new Y.Doc()
 * const { columnId, viewId } = setupNewDatabase(doc)
 * ```
 */
export function setupNewDatabase(doc: Y.Doc): { columnId: string; viewId: string } {
  initializeDatabaseDoc(doc)
  const columnId = addDefaultTitleColumn(doc)
  const viewId = addDefaultTableView(doc)
  return { columnId, viewId }
}

// ─── Meta Operations ──────────────────────────────────────────────────────────

/**
 * Get a metadata value from the database doc.
 */
export function getMeta<T>(doc: Y.Doc, key: string): T | undefined {
  const meta = doc.getMap('meta')
  return meta.get(key) as T | undefined
}

/**
 * Set a metadata value in the database doc.
 */
export function setMeta<T>(doc: Y.Doc, key: string, value: T): void {
  const meta = doc.getMap('meta')
  meta.set(key, value)
}

/**
 * Delete a metadata value from the database doc.
 */
export function deleteMeta(doc: Y.Doc, key: string): void {
  const meta = doc.getMap('meta')
  meta.delete(key)
}
