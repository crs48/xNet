/**
 * Database View - Table/Board view with dynamic schema
 *
 * Simplified version ported from apps/electron
 */

import { DatabaseSchema, type PropertyDefinition, type PropertyType } from '@xnet/data'
import { useNode, useIdentity } from '@xnet/react'
import { TableView, BoardView, type ViewConfig, type TableRow } from '@xnet/views'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface DatabaseViewProps {
  docId: string
}

type ViewMode = 'table' | 'board'

/**
 * Stored column definition
 */
interface StoredColumn {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
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

const DEFAULT_COLUMNS: StoredColumn[] = [
  { id: 'title', name: 'Title', type: 'text' },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    config: {
      options: [
        { id: 'todo', label: 'To Do', color: '#6b7280' },
        { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
        { id: 'done', label: 'Done', color: '#22c55e' }
      ]
    }
  },
  {
    id: 'priority',
    name: 'Priority',
    type: 'select',
    config: {
      options: [
        { id: 'low', label: 'Low', color: '#6b7280' },
        { id: 'medium', label: 'Medium', color: '#f59e0b' },
        { id: 'high', label: 'High', color: '#ef4444' }
      ]
    }
  },
  { id: 'dueDate', name: 'Due Date', type: 'date' }
]

export function DatabaseView({ docId }: DatabaseViewProps) {
  const { identity } = useIdentity()
  const did = identity?.did

  const {
    data: database,
    doc,
    loading,
    update,
    presence
  } = useNode(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' },
    did: did ?? undefined
  })

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [columns, setColumns] = useState<StoredColumn[]>([])
  const [rows, setRows] = useState<TableRow[]>([])
  const [tableViewConfig, setTableViewConfig] = useState<ViewConfig | null>(null)
  const [boardViewConfig, setBoardViewConfig] = useState<ViewConfig | null>(null)

  // ─── Initialize / Load Data ─────────────────────────────────────────────

  useEffect(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')

    // Load or initialize columns
    let storedColumns = dataMap.get('columns') as StoredColumn[] | undefined
    if (!storedColumns || storedColumns.length === 0) {
      storedColumns = DEFAULT_COLUMNS
      dataMap.set('columns', storedColumns)
    }
    setColumns(storedColumns)

    // Load or initialize rows
    let storedRows = dataMap.get('rows') as TableRow[] | undefined
    if (!storedRows) {
      storedRows = []
      dataMap.set('rows', storedRows)
    }
    setRows(storedRows)

    // Load or initialize view configs
    let tableConfig = dataMap.get('tableView') as ViewConfig | undefined
    if (!tableConfig) {
      tableConfig = buildDefaultTableView(storedColumns)
      dataMap.set('tableView', tableConfig)
    }
    setTableViewConfig(tableConfig)

    let boardConfig = dataMap.get('boardView') as ViewConfig | undefined
    if (!boardConfig) {
      boardConfig = buildDefaultBoardView(storedColumns)
      dataMap.set('boardView', boardConfig)
    }
    setBoardViewConfig(boardConfig)

    // Observe changes
    const observer = () => {
      const cols = dataMap.get('columns') as StoredColumn[] | undefined
      const rws = dataMap.get('rows') as TableRow[] | undefined
      const tbl = dataMap.get('tableView') as ViewConfig | undefined
      const brd = dataMap.get('boardView') as ViewConfig | undefined

      if (cols) setColumns(cols)
      if (rws) setRows(rws)
      if (tbl) setTableViewConfig(tbl)
      if (brd) setBoardViewConfig(brd)
    }

    dataMap.observe(observer)
    return () => dataMap.unobserve(observer)
  }, [doc])

  // ─── Row Operations ─────────────────────────────────────────────────────

  const handleAddRow = useCallback(() => {
    if (!doc) return

    const newRow: TableRow = {
      id: Math.random().toString(36).substring(2, 15),
      data: { title: '' }
    }

    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[]) || []
    dataMap.set('rows', [...currentRows, newRow])
  }, [doc])

  const handleUpdateRow = useCallback(
    (rowId: string, property: string, value: unknown) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[]) || []
      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, data: { ...(row.data || {}), [property]: value } } : row
      )
      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[]) || []
      dataMap.set(
        'rows',
        currentRows.filter((r) => r.id !== rowId)
      )
    },
    [doc]
  )

  const handleMoveCard = useCallback(
    (rowId: string, toColumn: string) => {
      if (!doc || !boardViewConfig?.groupByProperty) return

      const dataMap = doc.getMap('data')
      const currentRows = (dataMap.get('rows') as TableRow[]) || []
      const updatedRows = currentRows.map((row) =>
        row.id === rowId
          ? { ...row, data: { ...(row.data || {}), [boardViewConfig.groupByProperty!]: toColumn } }
          : row
      )
      dataMap.set('rows', updatedRows)
    },
    [doc, boardViewConfig]
  )

  // ─── Column Operations ─────────────────────────────────────────────────

  const handleAddColumn = useCallback(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[]) || []

    const newCol: StoredColumn = {
      id: Math.random().toString(36).substring(2, 15),
      name: 'New Column',
      type: 'text'
    }
    dataMap.set('columns', [...currentColumns, newCol])

    // Update view configs
    const tbl = (dataMap.get('tableView') as ViewConfig) || buildDefaultTableView(currentColumns)
    dataMap.set('tableView', {
      ...tbl,
      visibleProperties: [...tbl.visibleProperties, newCol.id]
    })
  }, [doc])

  const handleUpdateColumn = useCallback(
    (
      columnId: string,
      updates: { name?: string; type?: string; config?: Record<string, unknown> }
    ) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[]) || []
      const updatedCols = currentColumns.map((c) =>
        c.id === columnId
          ? {
              ...c,
              ...(updates.name && { name: updates.name }),
              ...(updates.type && { type: updates.type as PropertyType })
            }
          : c
      )
      dataMap.set('columns', updatedCols)
    },
    [doc]
  )

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentColumns = (dataMap.get('columns') as StoredColumn[]) || []
      dataMap.set(
        'columns',
        currentColumns.filter((c) => c.id !== columnId)
      )
    },
    [doc]
  )

  const handleUpdateView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const configKey = viewMode === 'table' ? 'tableView' : 'boardView'
      const currentConfig = dataMap.get(configKey) as ViewConfig | undefined
      if (currentConfig) {
        dataMap.set(configKey, { ...currentConfig, ...changes })
      }
    },
    [doc, viewMode]
  )

  // Build schema from columns
  const schema = useMemo(() => {
    const properties: PropertyDefinition[] = columns.map((col) => ({
      '@id': `xnet://xnet.fyi/DynamicDatabase#${col.id}`,
      name: col.name,
      type: col.type,
      required: false,
      config: col.config
    }))

    return {
      '@id': 'xnet://xnet.fyi/DynamicDatabase' as const,
      '@type': 'xnet://xnet.fyi/Schema' as const,
      name: 'DynamicDatabase',
      namespace: 'xnet://xnet.fyi/' as const,
      properties
    }
  }, [columns])

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading database...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full -m-6">
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

        <div className="flex-1" />

        {/* Presence avatars */}
        <PresenceAvatars presence={presence} />

        {/* Share button */}
        <ShareButton docId={docId} docType="database" />

        {/* View mode toggle */}
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'table'
                ? 'bg-primary text-white'
                : 'bg-transparent text-foreground hover:bg-accent'
            }`}
          >
            <Table size={14} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-primary text-white'
                : 'bg-transparent text-foreground hover:bg-accent'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Board</span>
          </button>
        </div>

        <button
          onClick={handleAddRow}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          <span>Add Row</span>
        </button>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'table' && tableViewConfig && (
          <TableView
            schema={schema}
            view={tableViewConfig}
            data={rows}
            onUpdateRow={handleUpdateRow}
            onUpdateView={handleUpdateView}
            onAddColumn={handleAddColumn}
            onUpdateColumn={handleUpdateColumn}
            onDeleteColumn={handleDeleteColumn}
            onAddRow={handleAddRow}
            onDeleteRow={handleDeleteRow}
          />
        )}

        {viewMode === 'board' && boardViewConfig && (
          <BoardView
            schema={schema}
            view={boardViewConfig}
            data={rows}
            onUpdateRow={handleMoveCard}
            onUpdateView={handleUpdateView}
            onAddCard={handleAddRow}
          />
        )}
      </div>
    </div>
  )
}
