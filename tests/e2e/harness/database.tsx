/**
 * E2E Test Harness for the V2 Database Grid (exploration 0159)
 *
 * Renders the real V2 stack — useGridDatabase + GridToolbar + GridSurface —
 * against a hub-synced store, with a debug strip and helper buttons the
 * Playwright specs drive. Multi-user: open with ?user=2&db=<same-id> in a
 * second context to exercise sync/presence.
 *
 * Used by src/database.spec.ts and src/database-undo.spec.ts.
 */

import { MemoryNodeStorageAdapter, DatabaseSchema } from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { XNetProvider, useGridDatabase, useNode } from '@xnetjs/react'
import { GridSurface, GridToolbar } from '@xnetjs/views'
import React, { useCallback, useRef, useState } from 'react'
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

// ─── Database Harness ────────────────────────────────────────────────

function DatabaseHarness() {
  const { loading, error, syncStatus } = useNode(DatabaseSchema, dbId, {
    createIfMissing: { title: 'Database E2E Test' }
  })
  const [search, setSearch] = useState('')
  const grid = useGridDatabase(dbId, { search: search || undefined })
  const seededRef = useRef(false)

  // ─── Helper actions the specs drive ─────────────────────────────────

  const handleAddTextField = useCallback(() => {
    void (async () => {
      await grid.addField(`Text ${grid.fields.length + 1}`, 'text', undefined, {
        isTitle: grid.fields.length === 0
      })
      // First field also bootstraps the default view (the app shells do
      // this on database creation)
      if (grid.views.length === 0) {
        await grid.addView('Table', 'table')
      }
    })()
  }, [grid])

  const handleAddSelectField = useCallback(() => {
    void grid.addField('Status', 'select')
  }, [grid])

  const handleAddRow = useCallback(() => {
    void grid.addRow()
  }, [grid])

  const handleSeedFixture = useCallback(() => {
    if (seededRef.current) return
    seededRef.current = true
    void (async () => {
      const titleId = await grid.addField('Title', 'text', undefined, { isTitle: true })
      await grid.addField('Status', 'select')
      await grid.addField('Tags', 'multiSelect')
      if (titleId) {
        await grid.addRow(undefined, { [titleId]: 'Initial' })
      }
    })()
  }, [grid])

  const titleField = grid.fields.find((f) => f.isTitle) ?? grid.fields[0]
  const firstRow = grid.rows[0]

  const handleEditTitleCell = useCallback(() => {
    if (firstRow && titleField) {
      void grid.updateCell(firstRow.id, titleField.id, 'Edited title')
    }
  }, [grid, firstRow, titleField])

  const handleDeleteLastRow = useCallback(() => {
    const last = grid.rows[grid.rows.length - 1]
    if (last) void grid.deleteRows([last.id])
  }, [grid])

  // ─── Debug values for assertions ────────────────────────────────────

  const firstRowTitle = firstRow && titleField ? String(firstRow.cells[titleField.id] ?? '') : ''
  const statusField = grid.fields.find((f) => f.name === 'Status')
  const tagsField = grid.fields.find((f) => f.name === 'Tags')
  const firstRowTagNames = (() => {
    if (!firstRow || !tagsField) return '[]'
    const ids = firstRow.cells[tagsField.id]
    if (!Array.isArray(ids) || ids.length === 0) return '[]'
    const names = ids.map((id) => tagsField.options?.find((o) => o.id === id)?.name ?? String(id))
    return `[${names.join(', ')}]`
  })()

  return (
    <div
      data-testid="editor-root"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
    >
      <h1 data-testid="title" style={{ fontSize: 16, padding: '8px 12px' }}>
        Database E2E Test
      </h1>

      <div data-testid="status" style={{ padding: '0 12px 8px', color: '#666', fontSize: 12 }}>
        User {userNum} | Sync: <span data-testid="sync-status">{syncStatus}</span> | Columns:{' '}
        <span data-testid="column-count">{grid.fields.length}</span> | Rows:{' '}
        <span data-testid="row-count">{grid.rows.length}</span> | First title:{' '}
        <span data-testid="first-row-title">{firstRowTitle}</span> | First tags:{' '}
        <span data-testid="first-row-tags">{firstRowTagNames}</span> | Status type:{' '}
        <span data-testid="status-column-type">{statusField?.type ?? 'missing'}</span> | StatusRaw:{' '}
        <span data-testid="first-row-status-raw">
          {firstRow && statusField ? JSON.stringify(firstRow.cells[statusField.id] ?? null) : 'n/a'}
        </span>{' '}
        | Options:{' '}
        <span data-testid="status-option-count">{statusField?.options?.length ?? 0}</span> | Undo:{' '}
        <span data-testid="can-undo">{String(grid.canUndo)}</span>
      </div>

      {loading && <div data-testid="loading">Loading...</div>}
      {error && <div data-testid="error">Error: {error.message}</div>}

      <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px', flexWrap: 'wrap' }}>
        <button data-testid="add-column" onClick={handleAddTextField}>
          Add Text Column
        </button>
        <button data-testid="add-select-column" onClick={handleAddSelectField}>
          Add Status Column
        </button>
        <button data-testid="add-row" onClick={handleAddRow}>
          Add Row
        </button>
        <button data-testid="seed-undo-fixture" onClick={handleSeedFixture}>
          Seed Undo Fixture
        </button>
        <button data-testid="edit-title-cell" onClick={handleEditTitleCell}>
          Edit Title Cell
        </button>
        <button data-testid="delete-last-row" onClick={handleDeleteLastRow}>
          Delete Last Row
        </button>
        <button data-testid="undo-action" onClick={() => void grid.undo()}>
          Undo
        </button>
        <button data-testid="redo-action" onClick={() => void grid.redo()}>
          Redo
        </button>
      </div>

      {grid.fields.length === 0 && grid.rows.length === 0 && !grid.loading && (
        <div data-testid="empty-state" style={{ padding: 12, color: '#999' }}>
          Empty database — add a column to get started
        </div>
      )}

      <GridToolbar
        views={grid.views.map((v) => ({ id: v.id, name: v.name, type: v.type }))}
        activeViewId={grid.activeView?.id}
        fields={grid.fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          config: f.config as Record<string, unknown>,
          width: f.width,
          options: f.options
        }))}
        sorts={grid.activeView?.sorts ?? []}
        onToggleSort={(fieldId) => void grid.toggleSort(fieldId)}
        filters={grid.activeView?.filters ?? null}
        onChangeFilters={(filters) => void grid.setFilters(filters)}
        search={search}
        onSearchChange={setSearch}
        rowCount={grid.rows.length}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <GridSurface
          fields={grid.visibleFields.map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            config: f.config as Record<string, unknown>,
            width: f.width,
            isTitle: f.isTitle,
            options: f.options
          }))}
          rows={grid.rows.map((r) => ({ id: r.id, cells: r.cells }))}
          sorts={grid.activeView?.sorts}
          onUpdateCell={(rowId, fieldId, value) => void grid.updateCell(rowId, fieldId, value)}
          onClearCells={(cells) => void grid.clearCells(cells)}
          onAddRow={(afterRowId) => void grid.addRow(afterRowId)}
          onDeleteRows={(rowIds) => void grid.deleteRows(rowIds)}
          onMoveRow={(rowId, index) => void grid.moveRowToIndex(rowId, index)}
          onMoveField={(fieldId, index) => void grid.moveFieldToIndex(fieldId, index)}
          onResizeField={(fieldId, width) => void grid.resizeField(fieldId, width)}
          onToggleSort={(fieldId) => void grid.toggleSort(fieldId)}
          onCreateOption={grid.createOption}
          onUndo={() => void grid.undo()}
          onRedo={() => void grid.redo()}
        />
      </div>
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
        platform: 'web',
        // Both users must share a node-sync room (it defaults to the
        // author's own DID, which would isolate them)
        hubOptions: { nodeSyncRoom: `e2e:${dbId}` }
      }}
    >
      <DatabaseHarness />
    </XNetProvider>
  )
}

// ─── Mount ────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
