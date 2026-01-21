/**
 * Database View - Table/Board view with mock data
 *
 * Demonstrates TableView and BoardView from @xnet/views.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { TableView, BoardView } from '@xnet/views'
import { Table, LayoutGrid, Plus } from 'lucide-react'
import type * as Y from 'yjs'

interface DatabaseViewProps {
  docId: string
  ydoc: Y.Doc | null
  isLoading?: boolean
}

// Column definitions for the database
const columns = [
  { id: 'title', header: 'Title', accessor: 'title', width: 200 },
  { id: 'status', header: 'Status', accessor: 'status', width: 120 },
  { id: 'priority', header: 'Priority', accessor: 'priority', width: 100 },
  { id: 'assignee', header: 'Assignee', accessor: 'assignee', width: 150 },
  { id: 'dueDate', header: 'Due Date', accessor: 'dueDate', width: 120 }
]

// Board columns for Kanban
const boardColumns = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' }
]

type ViewMode = 'table' | 'board'

export function DatabaseView({ docId, ydoc, isLoading }: DatabaseViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])

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
        const sampleRows = [
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
        dataMap.set('rows', sampleRows)
        setRows(sampleRows)
      }
    }

    loadRows()

    // Observe changes
    const observer = () => loadRows()
    dataMap.observe(observer)

    return () => dataMap.unobserve(observer)
  }, [ydoc])

  // Add new row
  const handleAddRow = () => {
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
    const updatedRows = [...rows, newRow]
    dataMap.set('rows', updatedRows)
    setRows(updatedRows)
  }

  // Handle row updates
  const handleRowChange = (rowId: string, field: string, value: unknown) => {
    if (!ydoc) return

    const updatedRows = rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))

    const dataMap = ydoc.getMap('data')
    dataMap.set('rows', updatedRows)
    setRows(updatedRows)
  }

  // Group rows by status for board view
  const groupedRows = useMemo(() => {
    return boardColumns.map((col) => ({
      ...col,
      items: rows.filter((row) => row.status === col.id)
    }))
  }, [rows])

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
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'table' ? (
          <TableView
            columns={columns}
            rows={rows}
            onRowClick={(row) => console.log('Row clicked:', row)}
            onSort={(column, direction) => {
              const sorted = [...rows].sort((a, b) => {
                const aVal = String(a[column] ?? '')
                const bVal = String(b[column] ?? '')
                return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
              })
              setRows(sorted)
            }}
          />
        ) : (
          <BoardView
            columns={groupedRows}
            renderCard={(item) => (
              <div className="p-3 bg-bg-primary rounded-lg border border-border shadow-sm">
                <p className="font-medium text-sm mb-2">{item.title as string}</p>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      item.priority === 'high'
                        ? 'bg-red-100 text-red-700'
                        : item.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {item.priority as string}
                  </span>
                  {item.assignee && <span>{item.assignee as string}</span>}
                </div>
              </div>
            )}
            onCardClick={(item) => console.log('Card clicked:', item)}
            onCardMove={(cardId, fromColumn, toColumn) => {
              handleRowChange(cardId, 'status', toColumn)
            }}
          />
        )}
      </div>
    </div>
  )
}
