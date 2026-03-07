/**
 * Explicit legacy database materialization helpers.
 *
 * Legacy databases store columns, views, and rows inside one `data` Y.Map.
 * These helpers let the app materialize that state into the canonical
 * column/view Yjs structures plus DatabaseRow nodes in a deliberate,
 * idempotent step.
 */

import type { ColumnDefinition } from './column-types'
import type { DatabaseDocumentModel } from './legacy-model'
import type { ViewConfig } from './view-types'
import type { NodeStore } from '../store/store'
import type { TransactionOperation } from '../store/types'
import * as Y from 'yjs'
import { DatabaseRowSchema } from '../schema/schemas/database-row'
import { toCellProperties } from './cell-types'
import { getColumns } from './column-operations'
import { initializeDatabaseDoc, getMeta, setMeta } from './database-doc'
import { generateSortKey } from './fractional-index'
import {
  getDatabaseDocumentModel,
  getLegacyColumns,
  getLegacyRows,
  getLegacyViews
} from './legacy-model'
import { getViews } from './view-operations'

export interface LegacyDatabaseMigrationStatus {
  state: 'pending' | 'in-progress' | 'completed' | 'failed'
  sourceModel: DatabaseDocumentModel
  legacyColumns: number
  legacyViews: number
  legacyRows: number
  migratedColumns: number
  migratedViews: number
  migratedRows: number
  startedAt?: number
  completedAt?: number
  error?: string
}

const LEGACY_MIGRATION_META_KEY = 'legacyMigration'

function createDerivedStatus(doc: Y.Doc): LegacyDatabaseMigrationStatus | null {
  const sourceModel = getDatabaseDocumentModel(doc)
  if (sourceModel !== 'legacy' && sourceModel !== 'mixed') {
    return null
  }

  return {
    state: 'pending',
    sourceModel,
    legacyColumns: getLegacyColumns(doc).length,
    legacyViews: getLegacyViews(doc).length,
    legacyRows: getLegacyRows(doc).length,
    migratedColumns: getColumns(doc).length,
    migratedViews: getViews(doc).length,
    migratedRows: 0
  }
}

function materializeCanonicalColumn(doc: Y.Doc, column: ColumnDefinition): void {
  const columns = doc.getArray('columns')
  const alreadyExists = columns.toArray().some((entry) => {
    const columnMap = entry as Y.Map<unknown>
    return columnMap.get('id') === column.id
  })

  if (alreadyExists) {
    return
  }

  const columnMap = new Y.Map<unknown>()
  columnMap.set('id', column.id)
  columnMap.set('name', column.name)
  columnMap.set('type', column.type)
  columnMap.set('config', column.config ?? {})
  if (column.width !== undefined) {
    columnMap.set('width', column.width)
  }
  if (column.isTitle !== undefined) {
    columnMap.set('isTitle', column.isTitle)
  }

  columns.push([columnMap])
}

function materializeCanonicalView(doc: Y.Doc, view: ViewConfig): void {
  const views = doc.getMap('views')
  if (views.has(view.id)) {
    return
  }

  const viewMap = new Y.Map<unknown>()
  viewMap.set('id', view.id)
  viewMap.set('name', view.name)
  viewMap.set('type', view.type)
  viewMap.set('visibleColumns', view.visibleColumns)
  if (view.columnWidths) {
    viewMap.set('columnWidths', view.columnWidths)
  }
  viewMap.set('filters', view.filters ?? null)
  viewMap.set('sorts', view.sorts ?? [])
  viewMap.set('groupBy', view.groupBy ?? null)
  if (view.groupSort) {
    viewMap.set('groupSort', view.groupSort)
  }
  if (view.collapsedGroups) {
    viewMap.set('collapsedGroups', view.collapsedGroups)
  }
  if (view.coverColumn) {
    viewMap.set('coverColumn', view.coverColumn)
  }
  if (view.cardSize) {
    viewMap.set('cardSize', view.cardSize)
  }
  if (view.dateColumn) {
    viewMap.set('dateColumn', view.dateColumn)
  }
  if (view.endDateColumn) {
    viewMap.set('endDateColumn', view.endDateColumn)
  }

  views.set(view.id, viewMap)
}

function createRunningStatus(
  doc: Y.Doc,
  pending: LegacyDatabaseMigrationStatus
): LegacyDatabaseMigrationStatus {
  return {
    ...pending,
    state: 'in-progress',
    sourceModel: getDatabaseDocumentModel(doc),
    startedAt: Date.now(),
    error: undefined
  }
}

export function getLegacyDatabaseMigrationStatus(doc: Y.Doc): LegacyDatabaseMigrationStatus | null {
  const stored = getMeta<LegacyDatabaseMigrationStatus>(doc, LEGACY_MIGRATION_META_KEY)
  return stored ?? createDerivedStatus(doc)
}

export async function migrateLegacyDatabaseDocument(
  store: NodeStore,
  databaseId: string,
  doc: Y.Doc
): Promise<LegacyDatabaseMigrationStatus> {
  const pending =
    getLegacyDatabaseMigrationStatus(doc) ??
    ({
      state: 'completed',
      sourceModel: getDatabaseDocumentModel(doc),
      legacyColumns: 0,
      legacyViews: 0,
      legacyRows: 0,
      migratedColumns: getColumns(doc).length,
      migratedViews: getViews(doc).length,
      migratedRows: ((await store.get(databaseId))?.properties.rowCount as number) ?? 0,
      completedAt: Date.now()
    } satisfies LegacyDatabaseMigrationStatus)

  if (pending.state === 'completed') {
    return pending
  }

  initializeDatabaseDoc(doc)

  const running = createRunningStatus(doc, pending)
  setMeta(doc, LEGACY_MIGRATION_META_KEY, running)

  try {
    const legacyColumns = getLegacyColumns(doc)
    const legacyViews = getLegacyViews(doc)
    const legacyRows = getLegacyRows(doc)

    doc.transact(() => {
      legacyColumns.forEach((column) => materializeCanonicalColumn(doc, column))
      legacyViews.forEach((view) => materializeCanonicalView(doc, view))
    })

    const existingRows = await Promise.all(legacyRows.map((row) => store.get(row.id)))

    const { rowOperations } = legacyRows.reduce<{
      previousSortKey: string | undefined
      rowOperations: TransactionOperation[]
    }>(
      (state, row, index) => {
        const existingRow = existingRows[index]
        if (existingRow) {
          return {
            previousSortKey:
              (existingRow.properties.sortKey as string | undefined) ?? state.previousSortKey,
            rowOperations: state.rowOperations
          }
        }

        const sortKey =
          index === 0 && state.previousSortKey === undefined
            ? generateSortKey()
            : generateSortKey(state.previousSortKey, undefined)

        return {
          previousSortKey: sortKey,
          rowOperations: [
            ...state.rowOperations,
            {
              type: 'create',
              options: {
                id: row.id,
                schemaId: DatabaseRowSchema.schema['@id'],
                properties: {
                  database: databaseId,
                  sortKey,
                  ...toCellProperties(row.cells)
                }
              }
            }
          ]
        }
      },
      {
        previousSortKey: undefined,
        rowOperations: []
      }
    )

    if (rowOperations.length > 0) {
      await store.transaction(rowOperations)
    }

    await store.update(databaseId, {
      properties: {
        rowCount: legacyRows.length
      }
    })

    const completed: LegacyDatabaseMigrationStatus = {
      state: 'completed',
      sourceModel: pending.sourceModel,
      legacyColumns: legacyColumns.length,
      legacyViews: legacyViews.length,
      legacyRows: legacyRows.length,
      migratedColumns: getColumns(doc).length,
      migratedViews: getViews(doc).length,
      migratedRows: legacyRows.length,
      startedAt: running.startedAt,
      completedAt: Date.now()
    }

    setMeta(doc, LEGACY_MIGRATION_META_KEY, completed)

    return completed
  } catch (error) {
    const failed: LegacyDatabaseMigrationStatus = {
      ...running,
      state: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }

    setMeta(doc, LEGACY_MIGRATION_META_KEY, failed)

    throw error instanceof Error ? error : new Error(String(error))
  }
}
