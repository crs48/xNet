/**
 * Database View - Table/Board view with dynamic schema
 *
 * Schema (columns) and data (rows) are stored in Y.Doc, not hardcoded.
 * - doc.getMap('data').get('columns') -> PropertyDefinition[]
 * - doc.getMap('data').get('rows') -> TableRow[]
 * - doc.getMap('data').get('tableView') -> ViewConfig
 * - doc.getMap('data').get('boardView') -> ViewConfig
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNode, useIdentity } from '@xnet/react'
import { DatabaseSchema, type Schema, type PropertyDefinition, type PropertyType } from '@xnet/data'
import {
  TableView,
  BoardView,
  type ViewConfig,
  type TableRow,
  type CellPresence,
  type ColumnUpdate
} from '@xnet/views'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import { ShareButton } from './ShareButton'
import { PresenceAvatars } from './PresenceAvatars'

interface DatabaseViewProps {
  docId: string
}

type ViewMode = 'table' | 'board'

/**
 * Stored column definition (simplified PropertyDefinition for storage)
 */
interface StoredColumn {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
}

/**
 * Build a Schema object from stored columns
 */
function buildSchema(columns: StoredColumn[], dbId: string): Schema {
  const properties: PropertyDefinition[] = columns.map((col) => ({
    '@id': `xnet://xnet.dev/DynamicDatabase#${col.id}`,
    name: col.name,
    type: col.type,
    required: false,
    config: col.config
  }))

  return {
    '@id': `xnet://xnet.dev/DynamicDatabase` as const,
    '@type': 'xnet://xnet.dev/Schema',
    name: 'DynamicDatabase',
    namespace: 'xnet://xnet.dev/',
    properties
  }
}

/**
 * Build default view config from columns
 */
function buildDefaultTableView(columns: StoredColumn[]): ViewConfig {
  const visibleProperties = columns.map((c) => c.id)
  const propertyWidths: Record<string, number> = {}
  columns.forEach((c) => {
    propertyWidths[c.id] = c.type === 'text' ? 200 : 120
  })

  // Find first select column for grouping
  const selectColumn = columns.find((c) => c.type === 'select')

  return {
    id: 'default-table',
    name: 'Table View',
    type: 'table',
    visibleProperties,
    propertyWidths,
    sorts: [],
    groupByProperty: selectColumn?.id
  }
}

function buildDefaultBoardView(columns: StoredColumn[]): ViewConfig {
  const visibleProperties = columns.map((c) => c.id)
  const selectColumn = columns.find((c) => c.type === 'select')

  return {
    id: 'default-board',
    name: 'Board View',
    type: 'board',
    visibleProperties,
    sorts: [],
    groupByProperty: selectColumn?.id
  }
}

export function DatabaseView({ docId }: DatabaseViewProps) {
  const { did } = useIdentity()

  const {
    data: database,
    doc,
    loading,
    update,
    remoteUsers,
    awareness
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [columns, setColumns] = useState<StoredColumn[]>([])
  const [rows, setRows] = useState<TableRow[]>([])
  const [tableViewConfig, setTableViewConfig] = useState<ViewConfig | null>(null)
  const [boardViewConfig, setBoardViewConfig] = useState<ViewConfig | null>(null)
  const [cellPresences, setCellPresences] = useState<CellPresence[]>([])

  // Build schema from columns
  const schema = useMemo(() => buildSchema(columns, docId), [columns, docId])

  // Ensure we have valid view configs (use stored or build default)
  const effectiveTableView = useMemo(
    () => tableViewConfig || buildDefaultTableView(columns),
    [tableViewConfig, columns]
  )
  const effectiveBoardView = useMemo(
    () => boardViewConfig || buildDefaultBoardView(columns),
    [boardViewConfig, columns]
  )

  // Broadcast focused cell via awareness
  const handleCellFocus = useCallback(
    (rowId: string, columnId: string) => {
      if (!awareness) return
      awareness.setLocalStateField('cell', { rowId, columnId })
    },
    [awareness]
  )

  const handleCellBlur = useCallback(() => {
    if (!awareness) return
    awareness.setLocalStateField('cell', null)
  }, [awareness])

  // Listen for remote cell focus changes
  useEffect(() => {
    if (!awareness) return

    const updatePresences = () => {
      const states = awareness.getStates()
      const presences: CellPresence[] = []

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        if (clientId === awareness.clientID) return
        const user = state.user as { did?: string; color?: string; name?: string } | undefined
        const cell = state.cell as { rowId: string; columnId: string } | undefined
        if (user?.did && cell) {
          presences.push({
            rowId: cell.rowId,
            columnId: cell.columnId,
            color: user.color || '#999',
            did: user.did,
            name: user.name || 'Anonymous'
          })
        }
      })

      setCellPresences(presences)
    }

    awareness.on('change', updatePresences)
    updatePresences()

    return () => {
      awareness.off('change', updatePresences)
    }
  }, [awareness])

  // Load data from Y.Doc
  useEffect(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')

    const loadData = () => {
      // Load columns
      const storedColumns = dataMap.get('columns') as StoredColumn[] | undefined
      if (storedColumns && Array.isArray(storedColumns)) {
        setColumns(storedColumns)
      } else {
        // Default: empty database (no columns)
        setColumns([])
      }

      // Load rows
      const storedRows = dataMap.get('rows') as TableRow[] | undefined
      if (storedRows && Array.isArray(storedRows)) {
        setRows(storedRows)
      } else {
        // Default: no rows
        setRows([])
      }

      // Load view configs
      const storedTableView = dataMap.get('tableView') as ViewConfig | undefined
      if (storedTableView) setTableViewConfig(storedTableView)

      const storedBoardView = dataMap.get('boardView') as ViewConfig | undefined
      if (storedBoardView) setBoardViewConfig(storedBoardView)
    }

    loadData()

    const observer = () => loadData()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [doc])

  // Add new column
  const handleAddColumn = useCallback(() => {
    if (!doc) return

    const newColumn: StoredColumn = {
      id: `col_${Date.now()}`,
      name: 'New Column',
      type: 'text'
    }

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    const updatedColumns = [...currentColumns, newColumn]
    dataMap.set('columns', updatedColumns)

    // Update view configs to include new column
    const currentTableView = dataMap.get('tableView') as ViewConfig | undefined
    if (currentTableView) {
      dataMap.set('tableView', {
        ...currentTableView,
        visibleProperties: [...currentTableView.visibleProperties, newColumn.id],
        propertyWidths: { ...currentTableView.propertyWidths, [newColumn.id]: 150 }
      })
    }

    const currentBoardView = dataMap.get('boardView') as ViewConfig | undefined
    if (currentBoardView) {
      dataMap.set('boardView', {
        ...currentBoardView,
        visibleProperties: [...currentBoardView.visibleProperties, newColumn.id]
      })
    }
  }, [doc])

  // Update column (rename, change type)
  const handleUpdateColumn = useCallback(
    (columnId: string, updates: ColumnUpdate) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== columnId) return col
        return {
          ...col,
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.type !== undefined && { type: updates.type as PropertyType }),
          ...(updates.config !== undefined && { config: updates.config })
        }
      })

      dataMap.set('columns', updatedColumns)
    },
    [doc]
  )

  // Delete column
  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')

      // Remove from columns
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
      const updatedColumns = currentColumns.filter((col) => col.id !== columnId)
      dataMap.set('columns', updatedColumns)

      // Remove from view configs
      const currentTableView = dataMap.get('tableView') as ViewConfig | undefined
      if (currentTableView) {
        const { [columnId]: _, ...restWidths } = currentTableView.propertyWidths || {}
        dataMap.set('tableView', {
          ...currentTableView,
          visibleProperties: currentTableView.visibleProperties.filter((p) => p !== columnId),
          propertyWidths: restWidths
        })
      }

      const currentBoardView = dataMap.get('boardView') as ViewConfig | undefined
      if (currentBoardView) {
        dataMap.set('boardView', {
          ...currentBoardView,
          visibleProperties: currentBoardView.visibleProperties.filter((p) => p !== columnId),
          // If deleted column was groupBy, clear it
          groupByProperty:
            currentBoardView.groupByProperty === columnId
              ? undefined
              : currentBoardView.groupByProperty
        })
      }

      // Remove column data from all rows
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = currentRows.map((row) => {
        const { [columnId]: _, ...rest } = row
        return rest as TableRow
      })
      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!doc) return

    const newRow: TableRow = {
      id: Date.now().toString()
    }

    // Initialize all columns with empty/default values
    columns.forEach((col) => {
      switch (col.type) {
        case 'checkbox':
          newRow[col.id] = false
          break
        case 'number':
          newRow[col.id] = null
          break
        case 'multiSelect':
          newRow[col.id] = []
          break
        default:
          newRow[col.id] = ''
      }
    })

    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
    const updatedRows = [...currentRows, newRow]
    dataMap.set('rows', updatedRows)
  }, [doc, columns])

  // Handle row updates
  const handleUpdateRow = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as TableRow[] | undefined
      if (!currentRows) return

      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [propertyId]: value } : row
      )

      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  // Handle view config updates
  const handleUpdateTableView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return
      const newConfig = { ...effectiveTableView, ...changes }
      setTableViewConfig(newConfig)
      doc.getMap('data').set('tableView', newConfig)
    },
    [doc, effectiveTableView]
  )

  const handleUpdateBoardView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return
      const newConfig = { ...effectiveBoardView, ...changes }
      setBoardViewConfig(newConfig)
      doc.getMap('data').set('boardView', newConfig)
    },
    [doc, effectiveBoardView]
  )

  // Handle card add for board view
  const handleAddCard = useCallback(
    (columnId: string) => {
      if (!doc) return

      const newRow: TableRow = {
        id: Date.now().toString()
      }

      // Initialize columns, setting the groupBy column to the clicked column
      const groupByProp = effectiveBoardView.groupByProperty
      columns.forEach((col) => {
        if (col.id === groupByProp) {
          // Don't set __none__ as a value
          newRow[col.id] = columnId === '__none__' ? '' : columnId
        } else {
          switch (col.type) {
            case 'checkbox':
              newRow[col.id] = false
              break
            case 'number':
              newRow[col.id] = null
              break
            case 'multiSelect':
              newRow[col.id] = []
              break
            default:
              newRow[col.id] = ''
          }
        }
      })

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = [...currentRows, newRow]
      dataMap.set('rows', updatedRows)
    },
    [doc, columns, effectiveBoardView.groupByProperty]
  )

  // Handle adding a new board column (= adding a new select option)
  const handleAddBoardColumn = useCallback(() => {
    if (!doc) return

    const groupByProp = effectiveBoardView.groupByProperty
    if (!groupByProp) return

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

    // Find the groupBy column
    const groupColumn = currentColumns.find((c) => c.id === groupByProp)
    if (!groupColumn || (groupColumn.type !== 'select' && groupColumn.type !== 'multiSelect'))
      return

    // Add new option
    const options =
      (groupColumn.config?.options as Array<{ id: string; name: string; color?: string }>) || []
    const newOption = {
      id: `opt_${Date.now()}`,
      name: 'New Column',
      color: '#9ca3af'
    }

    const updatedColumns = currentColumns.map((col) => {
      if (col.id !== groupByProp) return col
      return {
        ...col,
        config: {
          ...col.config,
          options: [...options, newOption]
        }
      }
    })

    dataMap.set('columns', updatedColumns)
  }, [doc, effectiveBoardView.groupByProperty])

  // Handle renaming a board column (= renaming a select option)
  const handleRenameBoardColumn = useCallback(
    (columnId: string, newName: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== groupByProp) return col

        const options =
          (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []
        const updatedOptions = options.map((opt) =>
          opt.id === columnId ? { ...opt, name: newName } : opt
        )

        return {
          ...col,
          config: {
            ...col.config,
            options: updatedOptions
          }
        }
      })

      dataMap.set('columns', updatedColumns)
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  // Handle deleting a board column (= removing a select option)
  const handleDeleteBoardColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      // Remove option from the select column
      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== groupByProp) return col

        const options =
          (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []
        const updatedOptions = options.filter((opt) => opt.id !== columnId)

        return {
          ...col,
          config: {
            ...col.config,
            options: updatedOptions
          }
        }
      })

      dataMap.set('columns', updatedColumns)

      // Clear the deleted option value from all rows
      const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
      const updatedRows = currentRows.map((row) => {
        const value = row[groupByProp]
        if (value === columnId) {
          return { ...row, [groupByProp]: '' }
        }
        // Handle multiSelect
        if (Array.isArray(value)) {
          return { ...row, [groupByProp]: value.filter((v) => v !== columnId) }
        }
        return row
      })

      dataMap.set('rows', updatedRows)
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  // Handle reordering board columns (= reordering select options)
  const handleReorderBoardColumns = useCallback(
    (newOrder: string[]) => {
      if (!doc) return

      const groupByProp = effectiveBoardView.groupByProperty
      if (!groupByProp) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []

      const updatedColumns = currentColumns.map((col) => {
        if (col.id !== groupByProp) return col

        const options =
          (col.config?.options as Array<{ id: string; name: string; color?: string }>) || []

        // Reorder options based on newOrder
        const reorderedOptions = newOrder
          .map((id) => options.find((opt) => opt.id === id))
          .filter((opt): opt is { id: string; name: string; color?: string } => opt !== undefined)

        return {
          ...col,
          config: {
            ...col.config,
            options: reorderedOptions
          }
        }
      })

      dataMap.set('columns', updatedColumns)
    },
    [doc, effectiveBoardView.groupByProperty]
  )

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading database...</p>
      </div>
    )
  }

  // Empty state when no columns
  if (columns.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
          <input
            type="text"
            className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            value={database?.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Untitled"
          />
          <PresenceAvatars remoteUsers={remoteUsers} localDid={did} />
          <div className="flex-1" />
          <ShareButton docId={docId} docType="database" />
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <p className="mb-4">This database has no columns yet.</p>
          <button
            onClick={handleAddColumn}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            Add Column
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary">
        {/* Title */}
        <input
          type="text"
          className="text-lg font-semibold border-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          value={database?.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Untitled"
        />

        <PresenceAvatars remoteUsers={remoteUsers} localDid={did} />

        <div className="flex-1" />

        {/* View switcher */}
        <div className="flex items-center bg-accent rounded-md p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'table'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table size={14} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Board</span>
          </button>
        </div>

        <button
          onClick={handleAddRow}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          <span>New</span>
        </button>

        <ShareButton docId={docId} docType="database" />
      </div>

      {/* View content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'table' ? (
          <TableView
            schema={schema}
            view={effectiveTableView}
            data={rows}
            onUpdateRow={handleUpdateRow}
            onUpdateView={handleUpdateTableView}
            onAddColumn={handleAddColumn}
            onUpdateColumn={handleUpdateColumn}
            onDeleteColumn={handleDeleteColumn}
            onAddRow={handleAddRow}
            cellPresences={cellPresences}
            onCellFocus={handleCellFocus}
            onCellBlur={handleCellBlur}
          />
        ) : (
          <BoardView
            schema={schema}
            view={effectiveBoardView}
            data={rows}
            onUpdateRow={handleUpdateRow}
            onUpdateView={handleUpdateBoardView}
            onAddCard={handleAddCard}
            onAddColumn={handleAddBoardColumn}
            onRenameColumn={handleRenameBoardColumn}
            onDeleteColumn={handleDeleteBoardColumn}
            onReorderColumns={handleReorderBoardColumns}
            onCardClick={(itemId) => console.log('Card clicked:', itemId)}
          />
        )}
      </div>
    </div>
  )
}
