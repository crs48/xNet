/**
 * useReverseRelations - Hook for finding rows that link TO a given row
 *
 * Finds all rows in other databases that have relation columns pointing
 * to the specified row. Useful for showing "backlinks" or "linked from" sections.
 *
 * @example
 * ```tsx
 * const { relations, loading, error } = useReverseRelations(taskId, tasksDatabaseId)
 * // relations contains all rows that link to this task
 * ```
 */

import type { DatabaseRow } from './useDatabase'
import type { ColumnDefinition, RelationColumnConfig } from '@xnetjs/data'
import { fromCellProperties, getColumns, isDatabaseDocInitialized } from '@xnetjs/data'
import { useState, useEffect } from 'react'
import * as Y from 'yjs'
import { useNodeStore } from './useNodeStore'

export interface ReverseRelation {
  /** The row that links to the target row */
  row: DatabaseRow
  /** The relation column through which it links */
  column: ColumnDefinition
  /** ID of the source database */
  sourceDatabaseId: string
  /** Title of the source database */
  sourceDatabaseTitle: string
}

export interface UseReverseRelationsResult {
  /** Found reverse relations */
  relations: ReverseRelation[]
  /** Whether relations are loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Refetch the relations */
  refetch: () => void
}

/**
 * Hook for finding reverse relations (backlinks) to a row.
 *
 * @param rowId - The row ID to find links to
 * @param databaseId - The database containing the row
 * @returns Object containing relations, loading state, and error
 */
export function useReverseRelations(rowId: string, databaseId: string): UseReverseRelationsResult {
  const { store, isReady } = useNodeStore()
  const [relations, setRelations] = useState<ReverseRelation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  useEffect(() => {
    if (!store || !isReady || !rowId || !databaseId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const findReverseRelations = async () => {
      try {
        setLoading(true)

        // Step 1: Find all databases
        const allDatabases = await store.list({
          schemaId: 'xnet://xnet.fyi/Database'
        })

        const reverseRelations: ReverseRelation[] = []

        // Step 2: For each database, check for relation columns that point to our database
        for (const db of allDatabases) {
          if (cancelled) break

          try {
            // Get the database's Y.Doc to read columns
            const docContent = await store.getDocumentContent(db.id)
            if (!docContent || docContent.length === 0) continue

            // Create a Y.Doc and apply the stored content
            const doc = new Y.Doc({ guid: db.id })
            Y.applyUpdate(doc, docContent)

            if (!isDatabaseDocInitialized(doc)) {
              doc.destroy()
              continue
            }

            const columns = getColumns(doc)

            // Find relation columns that target our database
            const relationColumns = columns.filter(
              (col: ColumnDefinition): col is ColumnDefinition & { config: RelationColumnConfig } =>
                col.type === 'relation' &&
                (col.config as RelationColumnConfig)?.targetDatabase === databaseId
            )

            // Cleanup the doc
            doc.destroy()

            if (relationColumns.length === 0) continue

            // Step 3: For each relation column, find rows that contain our rowId
            for (const col of relationColumns) {
              if (cancelled) break

              // List all rows in this database
              const allRows = await store.list({
                schemaId: 'xnet://xnet.fyi/DatabaseRow'
              })

              // Filter to only rows in this database
              const rows = allRows.filter((row) => row.properties.database === db.id)

              // Filter rows that contain our rowId in the relation column
              for (const node of rows) {
                const cellKey = `cell_${col.id}`
                const cellValue = node.properties[cellKey]

                // Relation values are arrays of row IDs
                if (Array.isArray(cellValue) && cellValue.includes(rowId)) {
                  reverseRelations.push({
                    row: nodeToRow(node),
                    column: col,
                    sourceDatabaseId: db.id,
                    sourceDatabaseTitle: (db.properties.title as string) ?? 'Untitled'
                  })
                }
              }
            }
          } catch {
            // Skip databases we can't access
            continue
          }
        }

        if (!cancelled) {
          setRelations(reverseRelations)
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

    findReverseRelations()

    return () => {
      cancelled = true
    }
  }, [store, isReady, rowId, databaseId, refetchKey])

  const refetch = () => setRefetchKey((k) => k + 1)

  return { relations, loading, error, refetch }
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
