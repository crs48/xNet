/**
 * Database E2E test harness.
 *
 * Tests database data model features:
 * - Creating databases with columns
 * - Adding rows
 * - Updating cells
 *
 * Query params:
 *   ?user=1     -> User identity
 *   ?db=<id>    -> Database ID
 *   ?hub=<url>  -> Hub WebSocket URL
 */

import { DatabaseSchema, MemoryNodeStorageAdapter, type PropertyType } from '@xnet/data'
import { identityFromPrivateKey } from '@xnet/identity'
import { XNetProvider, useNode } from '@xnet/react'
import React, { useState, useCallback, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'

// ─── Parse query params ──────────────────────────────────────────────

const params = new URLSearchParams(window.location.search)
const userNum = parseInt(params.get('user') || '1', 10)
const dbId = params.get('db') || `e2e-db-${Date.now()}`
const hubUrl = params.get('hub') || 'ws://localhost:4444'

// ─── Deterministic identity per user ─────────────────────────────────

const seed = new Uint8Array(32)
seed[0] = userNum
const identity = identityFromPrivateKey(seed)
const authorDID = identity.did as `did:key:${string}`
const signingKey = seed

// ─── Storage (in-memory for E2E) ────────────────────────────────────

const nodeStorage = new MemoryNodeStorageAdapter()

// ─── Types ───────────────────────────────────────────────────────────

interface StoredColumn {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
}

interface TableRow {
  id: string
  [key: string]: unknown
}

interface DatabaseHistorySnapshot {
  columns: StoredColumn[]
  rows: TableRow[]
  tableView: Record<string, unknown> | undefined
  boardView: Record<string, unknown> | undefined
}

// ─── Database Editor Component ───────────────────────────────────────

function DatabaseEditor() {
  const { doc, loading, error, syncStatus } = useNode(DatabaseSchema, dbId, {
    createIfMissing: { title: 'E2E Test Database' }
  })

  const [viewMode, setViewMode] = useState<'table' | 'board'>('table')
  const [columns, setColumns] = useState<StoredColumn[]>([])
  const [rows, setRows] = useState<TableRow[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const historyPastRef = useRef<DatabaseHistorySnapshot[]>([])
  const historyFutureRef = useRef<DatabaseHistorySnapshot[]>([])

  const isTextInputLikeElement = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    )
  }, [])

  const isDatabaseEditableTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false
    return target.closest('[data-xnet-db-editable="true"]') !== null
  }, [])

  const readSnapshot = useCallback(
    (dataMap: { get: (key: string) => unknown }): DatabaseHistorySnapshot => {
      return {
        columns: structuredClone((dataMap.get('columns') as StoredColumn[] | undefined) ?? []),
        rows: structuredClone((dataMap.get('rows') as TableRow[] | undefined) ?? []),
        tableView: structuredClone(
          (dataMap.get('tableView') as Record<string, unknown> | undefined) ?? undefined
        ),
        boardView: structuredClone(
          (dataMap.get('boardView') as Record<string, unknown> | undefined) ?? undefined
        )
      }
    },
    []
  )

  const applySnapshot = useCallback(
    (
      dataMap: { set: (key: string, value: unknown) => void },
      snapshot: DatabaseHistorySnapshot
    ) => {
      dataMap.set('columns', structuredClone(snapshot.columns))
      dataMap.set('rows', structuredClone(snapshot.rows))
      if (snapshot.tableView) {
        dataMap.set('tableView', structuredClone(snapshot.tableView))
      }
      if (snapshot.boardView) {
        dataMap.set('boardView', structuredClone(snapshot.boardView))
      }
    },
    []
  )

  const pushHistorySnapshot = useCallback(() => {
    if (!doc) return
    const dataMap = doc.getMap('data')
    historyPastRef.current.push(readSnapshot(dataMap))
    historyFutureRef.current = []
  }, [doc, readSnapshot])

  const undo = useCallback(() => {
    if (!doc) return
    const dataMap = doc.getMap('data')
    const snapshot = historyPastRef.current.pop()
    if (!snapshot) return
    historyFutureRef.current.push(readSnapshot(dataMap))
    applySnapshot(dataMap, snapshot)
  }, [applySnapshot, doc, readSnapshot])

  const redo = useCallback(() => {
    if (!doc) return
    const dataMap = doc.getMap('data')
    const snapshot = historyFutureRef.current.pop()
    if (!snapshot) return
    historyPastRef.current.push(readSnapshot(dataMap))
    applySnapshot(dataMap, snapshot)
  }, [applySnapshot, doc, readSnapshot])

  const handleRootKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return

      const key = e.key.toLowerCase()
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      const targetIsTextInputLike = isTextInputLikeElement(e.target)
      const activeIsTextInputLike = isTextInputLikeElement(document.activeElement)
      const targetIsDatabaseEditable = isDatabaseEditableTarget(e.target)
      const activeIsDatabaseEditable = isDatabaseEditableTarget(document.activeElement)

      if (
        (targetIsTextInputLike && !targetIsDatabaseEditable) ||
        (activeIsTextInputLike && !activeIsDatabaseEditable)
      ) {
        return
      }

      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (!e.metaKey && e.ctrlKey && !e.shiftKey && key === 'y') {
        e.preventDefault()
        redo()
      }
    },
    [isDatabaseEditableTarget, isTextInputLikeElement, redo, undo]
  )

  // Load data from Y.Doc
  useEffect(() => {
    if (!doc) return

    const dataMap = doc.getMap('data')

    const loadData = () => {
      const storedColumns = dataMap.get('columns') as StoredColumn[] | undefined
      if (storedColumns && Array.isArray(storedColumns)) {
        setColumns(storedColumns)
      }

      const storedRows = dataMap.get('rows') as TableRow[] | undefined
      if (storedRows && Array.isArray(storedRows)) {
        setRows(storedRows)
      }
    }

    loadData()
    dataMap.observe(loadData)
    return () => dataMap.unobserve(loadData)
  }, [doc])

  // Add column
  const handleAddColumn = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()

    const newColumn: StoredColumn = {
      id: `col_${Date.now()}`,
      name: 'New Column',
      type: 'text'
    }

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    dataMap.set('columns', [...currentColumns, newColumn])
  }, [doc, pushHistorySnapshot])

  // Add select column for board view
  const handleAddSelectColumn = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()

    const newColumn: StoredColumn = {
      id: `col_${Date.now()}`,
      name: 'Status',
      type: 'select',
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: '#ef4444' },
          { id: 'in-progress', name: 'In Progress', color: '#f59e0b' },
          { id: 'done', name: 'Done', color: '#22c55e' }
        ]
      }
    }

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    dataMap.set('columns', [...currentColumns, newColumn])
  }, [doc, pushHistorySnapshot])

  // Add row
  const handleAddRow = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()

    const newRow: TableRow = {
      id: `row_${Date.now()}`
    }

    // Initialize with empty values
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
    dataMap.set('rows', [...currentRows, newRow])
  }, [doc, columns, pushHistorySnapshot])

  // Update row
  const handleUpdateCell = useCallback(
    (rowId: string, columnId: string, value: string) => {
      if (!doc) return
      pushHistorySnapshot()

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as TableRow[] | undefined
      if (!currentRows) return

      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [columnId]: value } : row
      )
      dataMap.set('rows', updatedRows)
    },
    [doc, pushHistorySnapshot]
  )

  const handleSeedUndoFixture = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()

    const dataMap = doc.getMap('data')
    dataMap.set('columns', [
      { id: 'title', name: 'Title', type: 'text' },
      { id: 'tags', name: 'Tags', type: 'multiSelect', config: { options: [] } },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'todo', name: 'To Do', color: '#ef4444' },
            { id: 'done', name: 'Done', color: '#22c55e' }
          ]
        }
      }
    ])
    dataMap.set('rows', [{ id: 'row-1', title: 'Initial', tags: [], status: 'todo' }])
  }, [doc, pushHistorySnapshot])

  const handleEditTitleCell = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()
    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
    dataMap.set(
      'rows',
      currentRows.map((row) => (row.id === 'row-1' ? { ...row, title: 'Edited title' } : row))
    )
  }, [doc, pushHistorySnapshot])

  const handleEditTagsCell = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()
    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
    dataMap.set(
      'rows',
      currentRows.map((row) => (row.id === 'row-1' ? { ...row, tags: ['opt-a', 'opt-b'] } : row))
    )
  }, [doc, pushHistorySnapshot])

  const handleDeleteLastRow = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()
    const dataMap = doc.getMap('data')
    const currentRows = (dataMap.get('rows') as TableRow[] | undefined) || []
    dataMap.set('rows', currentRows.slice(0, -1))
  }, [doc, pushHistorySnapshot])

  const handleChangeStatusType = useCallback(() => {
    if (!doc) return
    pushHistorySnapshot()
    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    dataMap.set(
      'columns',
      currentColumns.map((column) =>
        column.id === 'status'
          ? {
              ...column,
              type: 'multiSelect',
              config: {
                options: [
                  { id: 'todo', name: 'To Do', color: '#ef4444' },
                  { id: 'done', name: 'Done', color: '#22c55e' }
                ],
                allowCreate: true
              }
            }
          : column
      )
    )
  }, [doc, pushHistorySnapshot])

  const handleUndo = useCallback(() => {
    undo()
  }, [undo])

  const handleRedo = useCallback(() => {
    redo()
  }, [redo])

  const firstRow = rows[0]
  const firstRowTitle = typeof firstRow?.title === 'string' ? firstRow.title : ''
  const firstRowTags = Array.isArray(firstRow?.tags) ? firstRow.tags : []
  const statusColumnType = columns.find((column) => column.id === 'status')?.type ?? 'missing'

  return (
    <div
      ref={containerRef}
      data-testid="editor-root"
      data-xnet-db-editable="true"
      tabIndex={0}
      onKeyDownCapture={handleRootKeyDown}
      style={{ padding: '20px', fontFamily: 'system-ui' }}
    >
      <h1 data-testid="title">Database E2E Test</h1>

      <div data-testid="status" style={{ marginBottom: '10px', color: '#666' }}>
        User {userNum} | Sync: <span data-testid="sync-status">{syncStatus}</span> | Columns:{' '}
        <span data-testid="column-count">{columns.length}</span> | Rows:{' '}
        <span data-testid="row-count">{rows.length}</span>
      </div>

      {loading && <div data-testid="loading">Loading...</div>}
      {error && <div data-testid="error">Error: {error.message}</div>}

      {!loading && !error && (
        <>
          {/* Toolbar */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <button data-testid="add-column" onClick={handleAddColumn}>
              Add Text Column
            </button>
            <button data-testid="add-select-column" onClick={handleAddSelectColumn}>
              Add Status Column
            </button>
            <button data-testid="add-row" onClick={handleAddRow}>
              Add Row
            </button>
            <button data-testid="seed-undo-fixture" onClick={handleSeedUndoFixture}>
              Seed Undo Fixture
            </button>
            <button data-testid="edit-title-cell" onClick={handleEditTitleCell}>
              Edit Title Cell
            </button>
            <button data-testid="edit-tags-cell" onClick={handleEditTagsCell}>
              Edit Tags Cell
            </button>
            <button data-testid="delete-last-row" onClick={handleDeleteLastRow}>
              Delete Last Row
            </button>
            <button data-testid="change-status-type" onClick={handleChangeStatusType}>
              Change Status Type
            </button>
            <button data-testid="undo-action" onClick={handleUndo}>
              Undo
            </button>
            <button data-testid="redo-action" onClick={handleRedo}>
              Redo
            </button>
            <div style={{ marginLeft: '20px' }}>
              <button
                data-testid="view-table"
                onClick={() => setViewMode('table')}
                style={{ fontWeight: viewMode === 'table' ? 'bold' : 'normal' }}
              >
                Table
              </button>
              <button
                data-testid="view-board"
                onClick={() => setViewMode('board')}
                style={{ fontWeight: viewMode === 'board' ? 'bold' : 'normal' }}
              >
                Board
              </button>
            </div>
          </div>

          {/* View */}
          <div data-testid="first-row-title">{firstRowTitle}</div>
          <div data-testid="first-row-tags">{JSON.stringify(firstRowTags)}</div>
          <div data-testid="status-column-type">{statusColumnType}</div>
          {columns.length === 0 ? (
            <div data-testid="empty-state">
              No columns yet. Click "Add Text Column" or "Add Status Column" to get started.
            </div>
          ) : (
            <div data-testid="view-container">
              {viewMode === 'table' ? (
                <table
                  data-testid="table-view"
                  style={{ borderCollapse: 'collapse', width: '100%' }}
                >
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col.id}
                          style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}
                        >
                          {col.name} ({col.type})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} data-testid={`row-${row.id}`}>
                        {columns.map((col) => (
                          <td key={col.id} style={{ border: '1px solid #ccc', padding: '8px' }}>
                            <input
                              type="text"
                              value={String(row[col.id] || '')}
                              onChange={(e) => handleUpdateCell(row.id, col.id, e.target.value)}
                              style={{ width: '100%', border: 'none', padding: '4px' }}
                              data-testid={`cell-${row.id}-${col.id}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div data-testid="board-view" style={{ display: 'flex', gap: '20px' }}>
                  {/* Simple board view - just show columns */}
                  {columns
                    .filter((c) => c.type === 'select')
                    .map((col) => {
                      const options =
                        (col.config?.options as Array<{ id: string; name: string }>) || []
                      return (
                        <div key={col.id} style={{ display: 'flex', gap: '10px' }}>
                          {options.map((opt) => (
                            <div
                              key={opt.id}
                              style={{
                                minWidth: '200px',
                                background: '#f3f4f6',
                                padding: '10px',
                                borderRadius: '8px'
                              }}
                            >
                              <h3>{opt.name}</h3>
                              <div>
                                {rows
                                  .filter((r) => r[col.id] === opt.id)
                                  .map((r) => (
                                    <div
                                      key={r.id}
                                      style={{
                                        background: 'white',
                                        padding: '8px',
                                        marginTop: '8px',
                                        borderRadius: '4px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                      }}
                                    >
                                      Row {r.id.slice(-4)}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  {columns.filter((c) => c.type === 'select').length === 0 && (
                    <div>Add a Status column to see the board view</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────

function App() {
  return (
    <XNetProvider
      config={{
        nodeStorage,
        authorDID,
        signingKey,
        hubUrl,
        platform: 'web'
      }}
    >
      <DatabaseEditor />
    </XNetProvider>
  )
}

// ─── Mount ────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
