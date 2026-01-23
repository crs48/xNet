/**
 * Database View - Table/Board view using @xnet/react hooks
 *
 * Uses @xnet/views TableView and BoardView with proper Schema + ViewConfig API.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useDocument } from '@xnet/react'
import { DatabaseSchema, defineSchema, text, select, date, type Schema } from '@xnet/data'
import { TableView, BoardView, type ViewConfig, type TableRow, type BoardRow } from '@xnet/views'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import { ShareButton } from './ShareButton'

interface DatabaseViewProps {
  docId: string
}

// Define a Task schema for the database items
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.dev/',
  properties: {
    title: text({ required: true }),
    status: select({
      options: [
        { id: 'todo', name: 'To Do', color: '#6B7280' },
        { id: 'in-progress', name: 'In Progress', color: '#3B82F6' },
        { id: 'review', name: 'Review', color: '#F59E0B' },
        { id: 'done', name: 'Done', color: '#10B981' }
      ] as const
    }),
    priority: select({
      options: [
        { id: 'low', name: 'Low', color: '#9CA3AF' },
        { id: 'medium', name: 'Medium', color: '#F59E0B' },
        { id: 'high', name: 'High', color: '#EF4444' }
      ] as const
    }),
    assignee: text(),
    dueDate: date()
  }
})

// Get the schema object for views
const schema: Schema = TaskSchema.schema

// Default view configurations
const defaultTableView: ViewConfig = {
  id: 'default-table',
  name: 'Table View',
  type: 'table',
  visibleProperties: ['title', 'status', 'priority', 'assignee', 'dueDate'],
  propertyWidths: {
    title: 200,
    status: 120,
    priority: 100,
    assignee: 150,
    dueDate: 120
  },
  sorts: [],
  groupByProperty: 'status'
}

const defaultBoardView: ViewConfig = {
  id: 'default-board',
  name: 'Board View',
  type: 'board',
  visibleProperties: ['title', 'priority', 'assignee', 'dueDate'],
  sorts: [],
  groupByProperty: 'status'
}

type ViewMode = 'table' | 'board'

// Sample data for new databases
const sampleData = [
  {
    id: '1',
    title: 'Design system setup',
    status: 'done',
    priority: 'high',
    assignee: 'Alice',
    dueDate: '2024-01-15'
  },
  {
    id: '2',
    title: 'API integration',
    status: 'in-progress',
    priority: 'high',
    assignee: 'Bob',
    dueDate: '2024-01-20'
  },
  {
    id: '3',
    title: 'Unit tests',
    status: 'todo',
    priority: 'medium',
    assignee: 'Carol',
    dueDate: '2024-01-25'
  },
  {
    id: '4',
    title: 'Documentation',
    status: 'todo',
    priority: 'low',
    assignee: 'Dan',
    dueDate: '2024-01-30'
  },
  {
    id: '5',
    title: 'Code review',
    status: 'review',
    priority: 'medium',
    assignee: 'Eve',
    dueDate: '2024-01-22'
  }
]

export function DatabaseView({ docId }: DatabaseViewProps) {
  const {
    data: database,
    doc,
    loading,
    update
  } = useDocument(DatabaseSchema, docId, {
    createIfMissing: { title: 'Untitled Database' }
    // Sync enabled - signaling server runs via `pnpm dev`
  })

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [rows, setRows] = useState<TableRow[]>([])
  const [tableViewConfig, setTableViewConfig] = useState<ViewConfig>(defaultTableView)
  const [boardViewConfig, setBoardViewConfig] = useState<ViewConfig>(defaultBoardView)

  // Load or initialize data from Y.Doc
  useEffect(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')

    const loadRows = () => {
      const storedRows = dataMap.get('rows') as TableRow[] | undefined
      if (storedRows && Array.isArray(storedRows)) {
        setRows(storedRows)
      } else if (dataMap.size === 0) {
        // Initialize with sample data for new databases
        dataMap.set('rows', sampleData)
        setRows(sampleData)
      }

      const storedTableView = dataMap.get('tableView') as ViewConfig | undefined
      if (storedTableView) setTableViewConfig(storedTableView)

      const storedBoardView = dataMap.get('boardView') as ViewConfig | undefined
      if (storedBoardView) setBoardViewConfig(storedBoardView)
    }

    loadRows()

    const observer = () => loadRows()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [doc])

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!doc) return

    const newRow = {
      id: Date.now().toString(),
      title: 'New item',
      status: 'todo',
      priority: 'medium',
      assignee: '',
      dueDate: ''
    }

    const dataMap = doc.getMap('data')
    const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
    const updatedRows = [...(currentRows || []), newRow]
    dataMap.set('rows', updatedRows)
  }, [doc])

  // Handle row updates
  const handleUpdateRow = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
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
      const newConfig = { ...tableViewConfig, ...changes }
      setTableViewConfig(newConfig)
      doc.getMap('data').set('tableView', newConfig)
    },
    [doc, tableViewConfig]
  )

  const handleUpdateBoardView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!doc) return
      const newConfig = { ...boardViewConfig, ...changes }
      setBoardViewConfig(newConfig)
      doc.getMap('data').set('boardView', newConfig)
    },
    [doc, boardViewConfig]
  )

  // Handle card add for board view
  const handleAddCard = useCallback(
    (columnId: string) => {
      if (!doc) return

      const newRow = {
        id: Date.now().toString(),
        title: 'New item',
        status: columnId,
        priority: 'medium',
        assignee: '',
        dueDate: ''
      }

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
      const updatedRows = [...(currentRows || []), newRow]
      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  if (loading || !doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading database...</p>
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
            view={tableViewConfig}
            data={rows}
            onUpdateRow={handleUpdateRow}
            onUpdateView={handleUpdateTableView}
            onAddRow={handleAddRow}
          />
        ) : (
          <BoardView
            schema={schema}
            view={boardViewConfig}
            data={rows}
            onUpdateRow={handleUpdateRow}
            onUpdateView={handleUpdateBoardView}
            onAddCard={handleAddCard}
            onCardClick={(itemId) => console.log('Card clicked:', itemId)}
          />
        )}
      </div>
    </div>
  )
}
