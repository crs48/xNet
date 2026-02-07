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
  SortConfig
} from '@xnet/data'
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
  isDatabaseDocInitialized
} from '@xnet/data'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Keep doc ref for callbacks
  const docRef = useRef<Y.Doc | null>(null)
  docRef.current = doc

  // Load the database's Y.Doc
  useEffect(() => {
    if (!store || !isReady || !databaseId) {
      setDoc(null)
      setColumns([])
      setViews([])
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
        if (!isDatabaseDocInitialized(ydoc)) {
          initializeDatabaseDoc(ydoc)
        }

        docRef.current = ydoc
        setDoc(ydoc)

        // Load initial data
        setColumns(getColumns(ydoc))
        setViews(getViews(ydoc))
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
  }, [store, isReady, databaseId])

  // Subscribe to column changes
  useEffect(() => {
    if (!doc) return

    const columnsArray = doc.getArray('columns')

    const updateColumns = () => {
      setColumns(getColumns(doc))
    }

    columnsArray.observeDeep(updateColumns)

    return () => {
      columnsArray.unobserveDeep(updateColumns)
    }
  }, [doc])

  // Subscribe to view changes
  useEffect(() => {
    if (!doc) return

    const viewsMap = doc.getMap('views')

    const updateViews = () => {
      setViews(getViews(doc))
    }

    viewsMap.observeDeep(updateViews)

    return () => {
      viewsMap.unobserveDeep(updateViews)
    }
  }, [doc])

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
      return createColumnOp(docRef.current, definition)
    },
    []
  )

  const handleUpdateColumn = useCallback(
    (columnId: string, updates: Partial<Omit<ColumnDefinition, 'id'>>): void => {
      if (!docRef.current) return
      updateColumnOp(docRef.current, columnId, updates)
    },
    []
  )

  const handleDeleteColumn = useCallback((columnId: string): void => {
    if (!docRef.current) return
    deleteColumnOp(docRef.current, columnId)
  }, [])

  const handleReorderColumn = useCallback((columnId: string, newIndex: number): void => {
    if (!docRef.current) return
    reorderColumnOp(docRef.current, columnId, newIndex)
  }, [])

  const handleDuplicateColumn = useCallback((columnId: string, newName?: string): string | null => {
    if (!docRef.current) return null
    return duplicateColumnOp(docRef.current, columnId, newName)
  }, [])

  const handleGetColumn = useCallback((columnId: string): ColumnDefinition | null => {
    if (!docRef.current) return null
    return getColumn(docRef.current, columnId)
  }, [])

  // View operations
  const handleCreateView = useCallback((config: Omit<ViewConfig, 'id'>): string | null => {
    if (!docRef.current) return null
    return createViewOp(docRef.current, config)
  }, [])

  const handleUpdateView = useCallback(
    (viewId: string, updates: Partial<Omit<ViewConfig, 'id'>>): void => {
      if (!docRef.current) return
      updateViewOp(docRef.current, viewId, updates)
    },
    []
  )

  const handleDeleteView = useCallback((viewId: string): void => {
    if (!docRef.current) return
    deleteViewOp(docRef.current, viewId)
  }, [])

  const handleDuplicateView = useCallback((viewId: string, newName?: string): string | null => {
    if (!docRef.current) return null
    return duplicateViewOp(docRef.current, viewId, newName)
  }, [])

  const handleGetView = useCallback((viewId: string): ViewConfig | null => {
    if (!docRef.current) return null
    return getView(docRef.current, viewId)
  }, [])

  return {
    columns,
    views,
    doc,
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
    getView: handleGetView
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
  SortConfig
}
