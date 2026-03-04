/**
 * Column UI E2E test harness.
 *
 * Tests AddColumnModal and SelectOptionsEditor components:
 * - Opening AddColumnModal
 * - Selecting column types
 * - Configuring select options
 * - Creating columns
 */

import type { ColumnType, SelectColor } from '@xnetjs/data'
import { AddColumnModal, SelectOptionsEditor, type NewColumnDefinition } from '@xnetjs/views'
import React, { useState, useCallback } from 'react'
import ReactDOM from 'react-dom/client'

// ─── Types ────────────────────────────────────────────────────────────

interface SelectOption {
  id: string
  name: string
  color?: SelectColor
}

interface CreatedColumn {
  name: string
  type: ColumnType
  config: Record<string, unknown>
}

// ─── Tailwind-like minimal styles ─────────────────────────────────────

const styles = `
  * { box-sizing: border-box; }
  body { 
    font-family: system-ui, -apple-system, sans-serif; 
    margin: 0; 
    padding: 20px;
    background: #f9fafb;
  }
  .container { max-width: 800px; margin: 0 auto; }
  .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .button { 
    padding: 8px 16px; 
    border-radius: 6px; 
    border: none; 
    cursor: pointer; 
    font-size: 14px;
    transition: background 0.2s;
  }
  .button-primary { background: #3b82f6; color: white; }
  .button-primary:hover { background: #2563eb; }
  .button-secondary { background: #e5e7eb; color: #374151; }
  .button-secondary:hover { background: #d1d5db; }
  .flex { display: flex; }
  .gap-2 { gap: 8px; }
  .gap-4 { gap: 16px; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .text-sm { font-size: 14px; }
  .text-gray { color: #6b7280; }
  .font-medium { font-weight: 500; }
  .mb-2 { margin-bottom: 8px; }
  .mb-4 { margin-bottom: 16px; }
  .mt-4 { margin-top: 16px; }
  .p-2 { padding: 8px; }
  .border { border: 1px solid #e5e7eb; }
  .rounded { border-radius: 6px; }
  .bg-gray-50 { background: #f9fafb; }
`

// ─── Main Test Component ──────────────────────────────────────────────

function ColumnUITest() {
  const [modalOpen, setModalOpen] = useState(false)
  const [createdColumns, setCreatedColumns] = useState<CreatedColumn[]>([])
  const [standaloneOptions, setStandaloneOptions] = useState<SelectOption[]>([
    { id: '1', name: 'Option 1', color: 'blue' },
    { id: '2', name: 'Option 2', color: 'green' }
  ])

  const handleAddColumn = useCallback((column: NewColumnDefinition) => {
    setCreatedColumns((prev) => [
      ...prev,
      {
        name: column.name,
        type: column.type,
        config: column.config as Record<string, unknown>
      }
    ])
  }, [])

  const handleClearColumns = useCallback(() => {
    setCreatedColumns([])
  }, [])

  const handleClearOptions = useCallback(() => {
    setStandaloneOptions([])
  }, [])

  return (
    <div className="container">
      <style>{styles}</style>

      <h1 data-testid="title">Column UI E2E Test</h1>

      {/* Status */}
      <div data-testid="status" className="card">
        <div className="flex justify-between items-center">
          <span>
            Created Columns: <span data-testid="column-count">{createdColumns.length}</span>
          </span>
          <span>
            Standalone Options: <span data-testid="option-count">{standaloneOptions.length}</span>
          </span>
        </div>
      </div>

      {/* AddColumnModal Test */}
      <div className="card">
        <h2 className="font-medium mb-4">AddColumnModal Test</h2>

        <div className="flex gap-2 mb-4">
          <button
            data-testid="open-modal"
            className="button button-primary"
            onClick={() => setModalOpen(true)}
          >
            Open Add Column Modal
          </button>
          <button
            data-testid="clear-columns"
            className="button button-secondary"
            onClick={handleClearColumns}
          >
            Clear Columns
          </button>
        </div>

        {/* Created columns list */}
        <div data-testid="created-columns">
          {createdColumns.length === 0 ? (
            <p className="text-sm text-gray">No columns created yet</p>
          ) : (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Created Columns:</h3>
              {createdColumns.map((col, i) => (
                <div
                  key={i}
                  data-testid={`column-${i}`}
                  className="p-2 border rounded mb-2 bg-gray-50"
                >
                  <div className="flex gap-4">
                    <span data-testid={`column-${i}-name`}>
                      <strong>Name:</strong> {col.name}
                    </span>
                    <span data-testid={`column-${i}-type`}>
                      <strong>Type:</strong> {col.type}
                    </span>
                  </div>
                  {col.config && Object.keys(col.config).length > 0 && (
                    <div data-testid={`column-${i}-config`} className="text-sm text-gray mt-2">
                      <strong>Config:</strong> {JSON.stringify(col.config)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <AddColumnModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={handleAddColumn}
        />
      </div>

      {/* SelectOptionsEditor Test */}
      <div className="card">
        <h2 className="font-medium mb-4">SelectOptionsEditor Test</h2>

        <div className="flex gap-2 mb-4">
          <button
            data-testid="clear-options"
            className="button button-secondary"
            onClick={handleClearOptions}
          >
            Clear All Options
          </button>
        </div>

        <div data-testid="options-editor" className="border rounded p-2">
          <SelectOptionsEditor
            options={standaloneOptions}
            onChange={setStandaloneOptions}
            allowCreate
          />
        </div>

        {/* Options state display */}
        <div data-testid="options-state" className="mt-4 p-2 bg-gray-50 rounded text-sm">
          <strong>Current Options:</strong>
          <pre>{JSON.stringify(standaloneOptions, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}

// ─── Mount ────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColumnUITest />
  </React.StrictMode>
)
