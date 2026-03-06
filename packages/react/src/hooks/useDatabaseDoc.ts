/**
 * useDatabaseDoc - Hook for database column and view operations
 *
 * Provides reactive access to the database's Y.Doc structure:
 * - Column definitions (CRDT-ordered)
 * - View configurations
 * - Column and view CRUD operations
 *
 * @example
 * ```tsx
 * const {
 *   columns,
 *   views,
 *   createColumn,
 *   updateColumn,
 *   deleteColumn,
 *   reorderColumn,
 *   createView,
 *   updateView,
 *   deleteView
 * } = useDatabaseDoc(databaseId)
 * ```
 */

import type {
  ColumnDefinition,
  ColumnType,
  ColumnConfig,
  ViewConfig,
  ViewType,
  FilterGroup,
  SortConfig,
  DatabaseDocumentModel,
  LegacyDatabaseMigrationStatus
} from '@xnetjs/data'
import {
  getColumns,
  getColumn,
  createColumn as createColumnOp,
  updateColumn as updateColumnOp,
  deleteColumn as deleteColumnOp,
  reorderColumn as reorderColumnOp,
  duplicateColumn as duplicateColumnOp,
  getViews,
  getView,
  createView as createViewOp,
  updateView as updateViewOp,
  deleteView as deleteViewOp,
  duplicateView as duplicateViewOp,
  initializeDatabaseDoc,
  isDatabaseDocInitialized,
  getDatabaseDocumentModel,
  getLegacyDatabaseMigrationStatus,
  migrateLegacyDatabaseDocument,
  prefersLegacyDatabaseModel,
  getLegacyColumns,
  getLegacyColumn,
  createLegacyColumn,
  updateLegacyColumn,
  deleteLegacyColumn,
  reorderLegacyColumn,
  getLegacyViews,
  getLegacyView,
  createLegacyView,
  updateLegacyView,
  deleteLegacyView
} from '@xnetjs/data'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseDatabaseDocResult {
  /** All column definitions (CRDT-ordered) */
  columns: ColumnDefinition[]

  /** All view configurations */
  views: ViewConfig[]

  /** Y.Doc for direct access (if needed) */
  doc: Y.Doc | null

  /** Which document storage model currently backs this database */
  storageMode: DatabaseDocumentModel

  /** Current legacy migration status, if the doc still carries legacy state */
  migrationStatus: LegacyDatabaseMigrationStatus | null

  /** Whether this doc can still be explicitly materialized into the canonical model */
  canMigrateLegacyModel: boolean

  /** Whether the doc is loading */
  loading: boolean

  /** Any error that occurred */
  error: Error | null

  // Column operations
  /** Create a new column */
  createColumn: (definition: Omit<ColumnDefinition, 'id'>) => string | null
  /** Update a column's properties */
  updateColumn: (columnId: string, updates: Partial<Omit<ColumnDefinition, 'id'>>) => void
  /** Delete a column */
  deleteColumn: (columnId: string) => void
  /** Reorder a column to a new position */
  reorderColumn: (columnId: string, newIndex: number) => void
  /** Duplicate a column */
  duplicateColumn: (columnId: string, newName?: string) => string | null
  /** Get a single column by ID */
  getColumn: (columnId: string) => ColumnDefinition | null

  // View operations
  /** Create a new view */
  createView: (config: Omit<ViewConfig, 'id'>) => string | null
  /** Update a view's properties */
  updateView: (viewId: string, updates: Partial<Omit<ViewConfig, 'id'>>) => void
  /** Delete a view */
  deleteView: (viewId: string) => void
  /** Duplicate a view */
  duplicateView: (viewId: string, newName?: string) => string | null
  /** Get a single view by ID */
  getView: (viewId: string) => ViewConfig | null

  /** Materialize legacy rows/columns/views into the canonical model */
  migrateLegacyModel: () => Promise<LegacyDatabaseMigrationStatus | null>
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for database column and view operations.
 *
 * Provides reactive access to the database's Y.Doc structure with
 * CRDT-based column ordering and real-time schema sync.
 */
export function useDatabaseDoc(databaseId: string): UseDatabaseDocResult {
  const { store, isReady } = useNodeStore()

  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [columns, setColumns] = useState<ColumnDefinition[]>([])
  const [views, setViews] = useState<ViewConfig[]>([])
  const [storageMode, setStorageMode] = useState<DatabaseDocumentModel>('empty')
  const [migrationStatus, setMigrationStatus] = useState<LegacyDatabaseMigrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Keep doc ref for callbacks
  const storeRef = useRef(store)
  storeRef.current = store
  const docRef = useRef<Y.Doc | null>(null)
  docRef.current = doc
  const storageModeRef = useRef<DatabaseDocumentModel>('empty')
  storageModeRef.current = storageMode

  const refreshStateFromDoc = useCallback((currentDoc: Y.Doc) => {
    const model = getDatabaseDocumentModel(currentDoc)
    const useLegacy = prefersLegacyDatabaseModel(currentDoc)

    setStorageMode(model)
    setColumns(useLegacy ? getLegacyColumns(currentDoc) : getColumns(currentDoc))
    setViews(useLegacy ? getLegacyViews(currentDoc) : getViews(currentDoc))
    setMigrationStatus(getLegacyDatabaseMigrationStatus(currentDoc))
  }, [])

  // Load the database's Y.Doc
  useEffect(() => {
    if (!store || !isReady || !databaseId) {
      setDoc(null)
      setColumns([])
      setViews([])
      setStorageMode('empty')
      setMigrationStatus(null)
      setLoading(false)
      return
    }

    let mounted = true

    const loadDoc = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create a Y.Doc for this database
        const ydoc = new Y.Doc({ guid: databaseId, gc: false })

        // Load stored content if any
        const storedContent = await store.getDocumentContent(databaseId)
        if (storedContent && storedContent.length > 0) {
          Y.applyUpdate(ydoc, storedContent)
        }

        if (!mounted) {
          ydoc.destroy()
          return
        }

        // Initialize if needed
        if (!isDatabaseDocInitialized(ydoc) && !prefersLegacyDatabaseModel(ydoc)) {
          initializeDatabaseDoc(ydoc)
        }

        docRef.current = ydoc
        setDoc(ydoc)

        refreshStateFromDoc(ydoc)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadDoc()

    return () => {
      mounted = false
      // Cleanup: save and destroy doc
      if (docRef.current && store) {
        const content = Y.encodeStateAsUpdate(docRef.current)
        store.setDocumentContent(databaseId, content).catch(() => {
          // Silent fail on unmount
        })
        docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [store, isReady, databaseId, refreshStateFromDoc])

  useEffect(() => {
    if (!doc) return

    const handleUpdate = () => {
      refreshStateFromDoc(doc)
    }

    doc.on('update', handleUpdate)
    handleUpdate()

    return () => {
      doc.off('update', handleUpdate)
    }
  }, [doc, refreshStateFromDoc])

  // Persist doc changes (debounced)
  useEffect(() => {
    if (!doc || !store) return

    let saveTimeout: ReturnType<typeof setTimeout> | null = null

    const handleUpdate = () => {
      // Debounce saves
      if (saveTimeout) {
        clearTimeout(saveTimeout)
      }
      saveTimeout = setTimeout(() => {
        if (docRef.current && store) {
          const content = Y.encodeStateAsUpdate(docRef.current)
          store.setDocumentContent(databaseId, content).catch(() => {
            // Silent fail
          })
        }
      }, 500)
    }

    doc.on('update', handleUpdate)

    return () => {
      doc.off('update', handleUpdate)
      if (saveTimeout) {
        clearTimeout(saveTimeout)
      }
    }
  }, [doc, store, databaseId])

  // Column operations
  const handleCreateColumn = useCallback(
    (definition: Omit<ColumnDefinition, 'id'>): string | null => {
      if (!docRef.current) return null
      if (storageModeRef.current === 'legacy') {
        return createLegacyColumn(docRef.current, definition)
      }
      return createColumnOp(docRef.current, definition)
    },
    []
  )

  const handleUpdateColumn = useCallback(
    (columnId: string, updates: Partial<Omit<ColumnDefinition, 'id'>>): void => {
      if (!docRef.current) return
      if (storageModeRef.current === 'legacy') {
        updateLegacyColumn(docRef.current, columnId, updates)
        return
      }
      updateColumnOp(docRef.current, columnId, updates)
    },
    []
  )

  const handleDeleteColumn = useCallback((columnId: string): void => {
    if (!docRef.current) return
    if (storageModeRef.current === 'legacy') {
      deleteLegacyColumn(docRef.current, columnId)
      return
    }
    deleteColumnOp(docRef.current, columnId)
  }, [])

  const handleReorderColumn = useCallback((columnId: string, newIndex: number): void => {
    if (!docRef.current) return
    if (storageModeRef.current === 'legacy') {
      reorderLegacyColumn(docRef.current, columnId, newIndex)
      return
    }
    reorderColumnOp(docRef.current, columnId, newIndex)
  }, [])

  const handleDuplicateColumn = useCallback((columnId: string, newName?: string): string | null => {
    if (!docRef.current) return null
    if (storageModeRef.current === 'legacy') {
      const column = getLegacyColumn(docRef.current, columnId)
      if (!column) return null
      const definition: Omit<ColumnDefinition, 'id'> = {
        name: column.name,
        type: column.type,
        config: column.config,
        ...(column.width !== undefined ? { width: column.width } : {}),
        ...(column.isTitle !== undefined ? { isTitle: column.isTitle } : {})
      }
      return createLegacyColumn(docRef.current, {
        ...definition,
        name: newName ?? `${column.name} (Copy)`
      })
    }
    return duplicateColumnOp(docRef.current, columnId, newName)
  }, [])

  const handleGetColumn = useCallback((columnId: string): ColumnDefinition | null => {
    if (!docRef.current) return null
    if (storageModeRef.current === 'legacy') {
      return getLegacyColumn(docRef.current, columnId)
    }
    return getColumn(docRef.current, columnId)
  }, [])

  // View operations
  const handleCreateView = useCallback((config: Omit<ViewConfig, 'id'>): string | null => {
    if (!docRef.current) return null
    if (storageModeRef.current === 'legacy') {
      return createLegacyView(docRef.current, config)
    }
    return createViewOp(docRef.current, config)
  }, [])

  const handleUpdateView = useCallback(
    (viewId: string, updates: Partial<Omit<ViewConfig, 'id'>>): void => {
      if (!docRef.current) return
      if (storageModeRef.current === 'legacy') {
        updateLegacyView(docRef.current, viewId, updates)
        return
      }
      updateViewOp(docRef.current, viewId, updates)
    },
    []
  )

  const handleDeleteView = useCallback((viewId: string): void => {
    if (!docRef.current) return
    if (storageModeRef.current === 'legacy') {
      deleteLegacyView(docRef.current, viewId)
      return
    }
    deleteViewOp(docRef.current, viewId)
  }, [])

  const handleDuplicateView = useCallback((viewId: string, newName?: string): string | null => {
    if (!docRef.current) return null
    if (storageModeRef.current === 'legacy') {
      const view = getLegacyView(docRef.current, viewId)
      if (!view) return null
      const config: Omit<ViewConfig, 'id'> = {
        name: view.name,
        type: view.type,
        visibleColumns: view.visibleColumns,
        ...(view.columnWidths !== undefined ? { columnWidths: view.columnWidths } : {}),
        ...(view.filters !== undefined ? { filters: view.filters } : {}),
        ...(view.sorts !== undefined ? { sorts: view.sorts } : {}),
        ...(view.groupBy !== undefined ? { groupBy: view.groupBy } : {}),
        ...(view.groupSort !== undefined ? { groupSort: view.groupSort } : {}),
        ...(view.collapsedGroups !== undefined ? { collapsedGroups: view.collapsedGroups } : {}),
        ...(view.coverColumn !== undefined ? { coverColumn: view.coverColumn } : {}),
        ...(view.cardSize !== undefined ? { cardSize: view.cardSize } : {}),
        ...(view.dateColumn !== undefined ? { dateColumn: view.dateColumn } : {}),
        ...(view.endDateColumn !== undefined ? { endDateColumn: view.endDateColumn } : {})
      }
      return createLegacyView(docRef.current, {
        ...config,
        name: newName ?? `${view.name} (Copy)`
      })
    }
    return duplicateViewOp(docRef.current, viewId, newName)
  }, [])

  const handleGetView = useCallback((viewId: string): ViewConfig | null => {
    if (!docRef.current) return null
    if (storageModeRef.current === 'legacy') {
      return getLegacyView(docRef.current, viewId)
    }
    return getView(docRef.current, viewId)
  }, [])

  const handleMigrateLegacyModel =
    useCallback(async (): Promise<LegacyDatabaseMigrationStatus | null> => {
      if (!storeRef.current || !docRef.current) return null

      const status = await migrateLegacyDatabaseDocument(
        storeRef.current,
        databaseId,
        docRef.current
      )
      refreshStateFromDoc(docRef.current)
      setMigrationStatus(status)
      return status
    }, [databaseId, refreshStateFromDoc])

  return {
    columns,
    views,
    doc,
    storageMode,
    migrationStatus,
    canMigrateLegacyModel:
      (storageMode === 'legacy' || storageMode === 'mixed') &&
      migrationStatus?.state !== 'completed',
    loading,
    error,

    // Column operations
    createColumn: handleCreateColumn,
    updateColumn: handleUpdateColumn,
    deleteColumn: handleDeleteColumn,
    reorderColumn: handleReorderColumn,
    duplicateColumn: handleDuplicateColumn,
    getColumn: handleGetColumn,

    // View operations
    createView: handleCreateView,
    updateView: handleUpdateView,
    deleteView: handleDeleteView,
    duplicateView: handleDuplicateView,
    getView: handleGetView,
    migrateLegacyModel: handleMigrateLegacyModel
  }
}

// Re-export types for convenience
export type {
  ColumnDefinition,
  ColumnType,
  ColumnConfig,
  ViewConfig,
  ViewType,
  FilterGroup,
  SortConfig,
  LegacyDatabaseMigrationStatus
}
