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
import React, { useState, useCallback, useEffect } from 'react'
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

// ─── Database Editor Component ───────────────────────────────────────

function DatabaseEditor() {
  const { doc, loading, error, syncStatus } = useNode(DatabaseSchema, dbId, {
    createIfMissing: { title: 'E2E Test Database' }
  })

  const [viewMode, setViewMode] = useState<'table' | 'board'>('table')
  const [columns, setColumns] = useState<StoredColumn[]>([])
  const [rows, setRows] = useState<TableRow[]>([])

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

    const newColumn: StoredColumn = {
      id: `col_${Date.now()}`,
      name: 'New Column',
      type: 'text'
    }

    const dataMap = doc.getMap('data')
    const currentColumns = (dataMap.get('columns') as StoredColumn[] | undefined) || []
    dataMap.set('columns', [...currentColumns, newColumn])
  }, [doc])

  // Add select column for board view
  const handleAddSelectColumn = useCallback(() => {
    if (!doc) return

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
  }, [doc])

  // Add row
  const handleAddRow = useCallback(() => {
    if (!doc) return

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
  }, [doc, columns])

  // Update row
  const handleUpdateCell = useCallback(
    (rowId: string, columnId: string, value: string) => {
      if (!doc) return

      const dataMap = doc.getMap('data')
      const currentRows = dataMap.get('rows') as TableRow[] | undefined
      if (!currentRows) return

      const updatedRows = currentRows.map((row) =>
        row.id === rowId ? { ...row, [columnId]: value } : row
      )
      dataMap.set('rows', updatedRows)
    },
    [doc]
  )

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
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
