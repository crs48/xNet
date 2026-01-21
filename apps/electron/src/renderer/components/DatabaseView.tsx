/**
 * Database View - Table/Board view with Yjs persistence
 *
 * Uses @xnet/views TableView and BoardView with proper Schema + ViewConfig API.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { TableView, BoardView, type ViewConfig } from '@xnet/views'
import { defineSchema, text, select, date, type Schema } from '@xnet/data'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import type * as Y from 'yjs'

interface DatabaseViewProps {
  docId: string
  ydoc: Y.Doc | null
  isLoading?: boolean
}

// Define a Task schema for the database
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

// Default view configuration for table
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

// Default view configuration for board
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

export function DatabaseView({ docId, ydoc, isLoading }: DatabaseViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [tableViewConfig, setTableViewConfig] = useState<ViewConfig>(defaultTableView)
  const [boardViewConfig, setBoardViewConfig] = useState<ViewConfig>(defaultBoardView)

  // Load or initialize data from Y.Doc
  useEffect(() => {
    if (!ydoc) return

    const dataMap = ydoc.getMap('data')

    // Load existing rows
    const loadRows = () => {
      const storedRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
      if (storedRows && Array.isArray(storedRows)) {
        setRows(storedRows)
      } else if (dataMap.size === 0) {
        // Initialize with sample data for new databases
        dataMap.set('rows', sampleData)
        setRows(sampleData)
      }

      // Load view configs
      const storedTableView = dataMap.get('tableView') as ViewConfig | undefined
      if (storedTableView) {
        setTableViewConfig(storedTableView)
      }
      const storedBoardView = dataMap.get('boardView') as ViewConfig | undefined
      if (storedBoardView) {
        setBoardViewConfig(storedBoardView)
      }
    }

    loadRows()

    // Observe changes
    const observer = () => loadRows()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [ydoc])

  // Add new row
  const handleAddRow = useCallback(() => {
    if (!ydoc) return

    const newRow = {
      id: Date.now().toString(),
      title: 'New item',
      status: 'todo',
      priority: 'medium',
      assignee: '',
      dueDate: ''
    }

    const dataMap = ydoc.getMap('data')
    const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
    const updatedRows = [...(currentRows || []), newRow]
    dataMap.set('rows', updatedRows)
  }, [ydoc])

  // Handle row updates
  const handleUpdateRow = useCallback(
    (rowId: string, propertyId: string, value: unknown) => {
      if (!ydoc) return

      const dataMap = ydoc.getMap('data')
      const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
      if (!currentRows) return

      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [propertyId]: value } : row
      )

      dataMap.set('rows', updatedRows)
    },
    [ydoc]
  )

  // Handle view config updates
  const handleUpdateTableView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!ydoc) return
      const newConfig = { ...tableViewConfig, ...changes }
      setTableViewConfig(newConfig)
      const dataMap = ydoc.getMap('data')
      dataMap.set('tableView', newConfig)
    },
    [ydoc, tableViewConfig]
  )

  const handleUpdateBoardView = useCallback(
    (changes: Partial<ViewConfig>) => {
      if (!ydoc) return
      const newConfig = { ...boardViewConfig, ...changes }
      setBoardViewConfig(newConfig)
      const dataMap = ydoc.getMap('data')
      dataMap.set('boardView', newConfig)
    },
    [ydoc, boardViewConfig]
  )

  // Handle card add for board view
  const handleAddCard = useCallback(
    (columnId: string) => {
      if (!ydoc) return

      const newRow = {
        id: Date.now().toString(),
        title: 'New item',
        status: columnId, // Use the column as the status
        priority: 'medium',
        assignee: '',
        dueDate: ''
      }

      const dataMap = ydoc.getMap('data')
      const currentRows = dataMap.get('rows') as Array<Record<string, unknown>> | undefined
      const updatedRows = [...(currentRows || []), newRow]
      dataMap.set('rows', updatedRows)
    },
    [ydoc]
  )

  if (isLoading || !ydoc) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Loading database...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-bg-secondary">
        <div className="flex items-center bg-bg-tertiary rounded-md p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'table'
                ? 'bg-bg-primary text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Table size={14} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              viewMode === 'board'
                ? 'bg-bg-primary text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Board</span>
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={handleAddRow}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-md text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          <span>New</span>
        </button>
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
