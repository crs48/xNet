/**
 * Stories for the V2 database grid (exploration 0159).
 *
 * The grid is store-agnostic (models in, callbacks out), so these stories
 * run it against a small in-memory database — every interaction works:
 * keyboard editing, typeahead tags, ghost row/column, sorting, filtering,
 * column drag/resize, files, presence, comments, peek.
 */

import type { CellPresence } from '../types'
import type { GridField, GridFieldOption, GridRowData } from './model'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  type CellValue,
  type ColumnDefinition,
  type FieldType,
  type FilterGroup,
  type RowHeight,
  type SortConfig,
  type SummaryFunction,
  convertCellValue,
  filterRows,
  resolveRowHeightPx,
  sortRows
} from '@xnetjs/data'
import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { GridFieldMenu } from './GridFieldMenu'
import { GridPeek } from './GridPeek'
import { GridSkeleton } from './GridSkeleton'
import { GridSummaryBar } from './GridSummaryBar'
import { GridSurface } from './GridSurface'
import { GridToolbar } from './GridToolbar'

const meta = {
  title: 'Core/Database/Grid V2',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ─── In-memory demo database ─────────────────────────────────────────────────

let idCounter = 0
const nextId = (prefix: string): string => `${prefix}-${++idCounter}`

interface DemoSeed {
  fields: GridField[]
  rows: GridRowData[]
  summaries?: Record<string, SummaryFunction>
}

interface DemoGridProps {
  seed: DemoSeed
  withToolbar?: boolean
  withPeek?: boolean
  withGhost?: boolean
  readOnly?: boolean
  presences?: CellPresence[]
  cellCommentCounts?: Map<string, number>
  resolveFileUrl?: (ref: { cid: string }) => Promise<string>
}

/** A fully interactive grid backed by local state. */
function DemoGrid({
  seed,
  withToolbar = true,
  withPeek = true,
  withGhost = true,
  readOnly,
  presences,
  cellCommentCounts,
  resolveFileUrl
}: DemoGridProps): ReactElement {
  const [fields, setFields] = useState<GridField[]>(seed.fields)
  const [rows, setRows] = useState<GridRowData[]>(seed.rows)
  const [sorts, setSorts] = useState<SortConfig[]>([])
  const [filters, setFilters] = useState<FilterGroup | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [peekRowId, setPeekRowId] = useState<string | null>(null)
  const [fieldMenu, setFieldMenu] = useState<{ fieldId: string; anchor: HTMLElement } | null>(null)
  const [rowHeight, setRowHeight] = useState<RowHeight>('short')
  const [summaries, setSummaries] = useState<Record<string, SummaryFunction>>(seed.summaries ?? {})

  const visibleFields = useMemo(
    () => fields.filter((f) => !hidden.includes(f.id)),
    [fields, hidden]
  )

  const columnDefs = useMemo(
    (): ColumnDefinition[] =>
      fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type as ColumnDefinition['type'],
        config: { ...f.config, options: f.options } as ColumnDefinition['config']
      })),
    [fields]
  )

  const viewRows = useMemo(() => {
    let result = rows.map((r, i) => ({ ...r, sortKey: String(i).padStart(4, '0') }))
    if (search.trim()) {
      const needle = search.toLowerCase()
      result = result.filter((r) =>
        Object.values(r.cells).some((v) =>
          String(v ?? '')
            .toLowerCase()
            .includes(needle)
        )
      )
    }
    result = filterRows(result, columnDefs, filters)
    return sortRows(result, columnDefs, sorts)
  }, [rows, columnDefs, filters, sorts, search])

  const updateCell = useCallback((rowId: string, fieldId: string, value: CellValue) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [fieldId]: value } } : r))
    )
  }, [])

  const createOption = useCallback(
    async (fieldId: string, name: string): Promise<string | null> => {
      const existing = fields
        .find((f) => f.id === fieldId)
        ?.options?.find((o) => o.name.toLowerCase() === name.toLowerCase())
      if (existing) return existing.id
      const option: GridFieldOption = {
        id: nextId('opt'),
        name,
        color: ['blue', 'green', 'orange', 'purple', 'pink', 'red'][name.length % 6]
      }
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, options: [...(f.options ?? []), option] } : f))
      )
      return option.id
    },
    [fields]
  )

  /** Retype a field, converting existing cell values (the real engine). */
  const changeFieldType = useCallback(
    (fieldId: string, type: FieldType) => {
      const sourceField = fields.find((f) => f.id === fieldId)
      if (!sourceField) return
      const ctx = {
        optionName: (id: string) => sourceField.options?.find((o) => o.id === id)?.name
      }
      const newOptions: GridFieldOption[] = []
      const nameToId = new Map<string, string>(
        (sourceField.options ?? []).map((o) => [o.name.toLowerCase(), o.id])
      )
      setRows((prev) =>
        prev.map((r) => {
          const converted = convertCellValue(r.cells[fieldId] ?? null, sourceField.type, type, ctx)
          let next = converted.value
          if (converted.optionNames) {
            const ids = converted.optionNames.map((name) => {
              const existing = nameToId.get(name.toLowerCase())
              if (existing) return existing
              const option: GridFieldOption = {
                id: nextId('opt'),
                name,
                color: ['blue', 'green', 'orange', 'purple', 'pink', 'red'][name.length % 6]
              }
              newOptions.push(option)
              nameToId.set(name.toLowerCase(), option.id)
              return option.id
            })
            next = type === 'multiSelect' ? ids : (ids[0] ?? null)
          }
          return { ...r, cells: { ...r.cells, [fieldId]: next } }
        })
      )
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId
            ? {
                ...f,
                type,
                options:
                  type === 'select' || type === 'multiSelect'
                    ? [...(f.options ?? []), ...newOptions]
                    : f.options
              }
            : f
        )
      )
    },
    [fields]
  )

  const menuField = fieldMenu ? fields.find((f) => f.id === fieldMenu.fieldId) : null
  const peekRow = viewRows.find((r) => r.id === peekRowId) ?? null

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      {withToolbar && (
        <GridToolbar
          views={[{ id: 'v1', name: 'Table', type: 'table' }]}
          activeViewId="v1"
          fields={fields}
          hiddenFieldIds={hidden}
          onToggleFieldVisible={(fieldId, hide) =>
            setHidden((prev) => (hide ? [...prev, fieldId] : prev.filter((id) => id !== fieldId)))
          }
          sorts={sorts}
          onToggleSort={(fieldId) =>
            setSorts((prev) => {
              const current = prev.find((s) => s.columnId === fieldId)
              if (!current) return [{ columnId: fieldId, direction: 'asc' }]
              if (current.direction === 'asc') return [{ columnId: fieldId, direction: 'desc' }]
              return []
            })
          }
          onClearSorts={() => setSorts([])}
          filters={filters}
          onChangeFilters={setFilters}
          rowHeight={rowHeight}
          onChangeRowHeight={setRowHeight}
          search={search}
          onSearchChange={setSearch}
          rowCount={viewRows.length}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <GridSurface
              fields={visibleFields}
              rows={viewRows}
              rowHeight={resolveRowHeightPx(rowHeight)}
              sorts={sorts}
              readOnly={readOnly}
              presences={presences}
              cellCommentCounts={cellCommentCounts}
              onUpdateCell={updateCell}
              onClearCells={(cells) =>
                cells.forEach(({ rowId, fieldId }) => updateCell(rowId, fieldId, null))
              }
              onAddRow={() => setRows((prev) => [...prev, { id: nextId('row'), cells: {} }])}
              onAddRowWithCells={
                withGhost
                  ? (cells) => setRows((prev) => [...prev, { id: nextId('row'), cells }])
                  : undefined
              }
              onAddFieldWithCell={
                withGhost
                  ? (rowId, value) => {
                      const field: GridField = {
                        id: nextId('field'),
                        name: `Column ${fields.length + 1}`,
                        type: 'text',
                        config: {},
                        width: 140
                      }
                      setFields((prev) => [...prev, field])
                      updateCell(rowId, field.id, value)
                    }
                  : undefined
              }
              onDeleteRows={(rowIds) =>
                setRows((prev) => prev.filter((r) => !rowIds.includes(r.id)))
              }
              onMoveRow={(rowId, targetIndex) =>
                setRows((prev) => {
                  const next = prev.filter((r) => r.id !== rowId)
                  const moved = prev.find((r) => r.id === rowId)
                  if (moved) next.splice(targetIndex, 0, moved)
                  return next
                })
              }
              onMoveField={(fieldId, targetIndex) =>
                setFields((prev) => {
                  const next = prev.filter((f) => f.id !== fieldId)
                  const moved = prev.find((f) => f.id === fieldId)
                  if (moved) next.splice(targetIndex, 0, moved)
                  return next
                })
              }
              onResizeField={(fieldId, width) =>
                setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, width } : f)))
              }
              onToggleSort={(fieldId) =>
                setSorts((prev) => {
                  const current = prev.find((s) => s.columnId === fieldId)
                  if (!current) return [{ columnId: fieldId, direction: 'asc' }]
                  if (current.direction === 'asc') return [{ columnId: fieldId, direction: 'desc' }]
                  return []
                })
              }
              onCreateOption={createOption}
              onResolveFileUrl={resolveFileUrl as never}
              onOpenRow={withPeek ? setPeekRowId : undefined}
              onFieldMenu={
                readOnly ? undefined : (fieldId, anchor) => setFieldMenu({ fieldId, anchor })
              }
            />
          </div>
          <GridSummaryBar
            fields={visibleFields}
            rows={viewRows}
            summaries={summaries}
            onChangeSummary={(fieldId, fn) =>
              setSummaries((prev) => {
                const next = { ...prev }
                if (fn === 'none') delete next[fieldId]
                else next[fieldId] = fn
                return next
              })
            }
          />
        </div>
        {fieldMenu && menuField && (
          <GridFieldMenu
            field={menuField}
            anchor={fieldMenu.anchor}
            onClose={() => setFieldMenu(null)}
            onRename={(fieldId, name) =>
              setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, name } : f)))
            }
            onChangeType={changeFieldType}
            onHide={(fieldId) => setHidden((prev) => [...prev, fieldId])}
            onDelete={(fieldId) => setFields((prev) => prev.filter((f) => f.id !== fieldId))}
          />
        )}
        {withPeek && peekRow && (
          <div className="w-[380px] shrink-0">
            <GridPeek
              row={peekRow}
              fields={fields}
              onClose={() => setPeekRowId(null)}
              onUpdateCell={updateCell}
              onDeleteRow={(rowId) => setRows((prev) => prev.filter((r) => r.id !== rowId))}
              onCreateOption={createOption}
              onResolveFileUrl={resolveFileUrl as never}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: GridFieldOption[] = [
  { id: 'st-todo', name: 'To Do', color: 'gray' },
  { id: 'st-doing', name: 'In Progress', color: 'blue' },
  { id: 'st-done', name: 'Done', color: 'green' }
]

const TAG_OPTIONS: GridFieldOption[] = [
  { id: 'tg-design', name: 'design', color: 'purple' },
  { id: 'tg-eng', name: 'engineering', color: 'blue' },
  { id: 'tg-urgent', name: 'urgent', color: 'red' },
  { id: 'tg-research', name: 'research', color: 'yellow' }
]

function field(name: string, type: FieldType, extra: Partial<GridField> = {}): GridField {
  return {
    id: name.toLowerCase().replace(/\s/g, '-'),
    name,
    type,
    config: {},
    width: 150,
    ...extra
  }
}

const TASK_FIELDS: GridField[] = [
  field('Task', 'text', { width: 240, isTitle: true }),
  field('Status', 'select', { width: 130, options: STATUS_OPTIONS }),
  field('Tags', 'multiSelect', { width: 200, options: TAG_OPTIONS }),
  field('Points', 'number', { width: 90 }),
  field('Due', 'date', { width: 130 }),
  field('Shipped', 'checkbox', { width: 90 })
]

const TASK_ROWS: GridRowData[] = [
  {
    id: 'r1',
    cells: {
      task: 'Design the onboarding flow',
      status: 'st-doing',
      tags: ['tg-design', 'tg-urgent'],
      points: 5,
      due: '2026-06-20T00:00:00.000Z',
      shipped: false
    }
  },
  {
    id: 'r2',
    cells: {
      task: 'Ship the collaborative grid',
      status: 'st-done',
      tags: ['tg-eng'],
      points: 13,
      due: '2026-06-10T00:00:00.000Z',
      shipped: true
    }
  },
  {
    id: 'r3',
    cells: {
      task: 'User interviews — mobile surface',
      status: 'st-todo',
      tags: ['tg-research'],
      points: 3,
      due: '2026-06-28T00:00:00.000Z',
      shipped: false
    }
  },
  {
    id: 'r4',
    cells: {
      task: 'Formula engine follow-ups',
      status: 'st-todo',
      tags: ['tg-eng', 'tg-research'],
      points: 8,
      shipped: false
    }
  }
]

const clone = (): DemoSeed => ({
  fields: TASK_FIELDS.map((f) => ({ ...f, options: f.options?.map((o) => ({ ...o })) })),
  rows: TASK_ROWS.map((r) => ({ ...r, cells: { ...r.cells } })),
  summaries: { points: 'sum', status: 'filled', shipped: 'percentChecked' }
})

// An inline SVG so image cells need no network
const DEMO_IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="240" cy="60" r="32" fill="#fde68a"/><path d="M0 160 L80 100 L150 150 L230 90 L320 140 V200 H0 Z" fill="#1e3a5f"/></svg>'
)}`

// ─── Stories ─────────────────────────────────────────────────────────────────

/**
 * The full kit: toolbar, grid, and row peek over an in-memory task list.
 * Try: click a cell and type, Tab/Enter to move, sort via headers, drag
 * columns, resize edges, filter from the toolbar, Space for row peek.
 */
export const Playground: Story = {
  render: () => <DemoGrid seed={clone()} />
}

/**
 * Spreadsheet flow: a fresh database. Click the ghost row at the bottom
 * and just type — committing creates the row. Type in the ghost column on
 * the right to create a new text field with that value.
 */
export const SpreadsheetGhostCells: Story = {
  render: () => (
    <DemoGrid
      seed={{
        fields: [
          field('Name', 'text', { width: 220, isTitle: true }),
          field('Notes', 'text', { width: 220 })
        ],
        rows: []
      }}
      withPeek={false}
    />
  )
}

/**
 * Typeahead tags: open a Status or Tags cell (Enter) and type — unknown
 * names show a "＋ Create" entry that mints a new colored option.
 */
export const TypeaheadTags: Story = {
  render: () => (
    <DemoGrid
      seed={{
        fields: [
          field('Task', 'text', { width: 240, isTitle: true }),
          field('Status', 'select', { width: 160, options: STATUS_OPTIONS.map((o) => ({ ...o })) }),
          field('Tags', 'multiSelect', { width: 260, options: TAG_OPTIONS.map((o) => ({ ...o })) })
        ],
        rows: TASK_ROWS.slice(0, 3).map((r) => ({ ...r, cells: { ...r.cells } }))
      }}
      withPeek={false}
    />
  )
}

/** Live presence: remote collaborators' cell focus as rings + name flags. */
export const Presence: Story = {
  render: () => (
    <DemoGrid
      seed={clone()}
      presences={[
        { rowId: 'r1', columnId: 'status', color: '#dc2626', did: 'did:key:alice', name: 'Alice' },
        { rowId: 'r3', columnId: 'task', color: '#16a34a', did: 'did:key:bob', name: 'Bob' }
      ]}
    />
  )
}

/** Comment badges: counts per cell, anchored to row+field (not coordinates). */
export const CommentBadges: Story = {
  render: () => (
    <DemoGrid
      seed={clone()}
      cellCommentCounts={
        new Map([
          ['r1:task', 3],
          ['r2:points', 1],
          ['r4:tags', 2]
        ])
      }
    />
  )
}

/** File cells: paperclip chips and inline image thumbnails; open the row peek for the lightbox. */
export const FilesAndImages: Story = {
  render: () => (
    <DemoGrid
      seed={{
        fields: [
          field('Name', 'text', { width: 200, isTitle: true }),
          field('Attachment', 'file', { width: 260 })
        ],
        rows: [
          {
            id: 'f1',
            cells: {
              name: 'Mountain photo',
              attachment: {
                cid: 'cid:demo:img',
                name: 'mountains.svg',
                mimeType: 'image/svg+xml',
                size: 2048
              }
            }
          },
          {
            id: 'f2',
            cells: {
              name: 'Quarterly report',
              attachment: {
                cid: 'cid:demo:pdf',
                name: 'q2-report.pdf',
                mimeType: 'application/pdf',
                size: 184320
              }
            }
          }
        ]
      }}
      resolveFileUrl={async () => DEMO_IMAGE_URL}
    />
  )
}

/** Read-only mode: selection and navigation work; editing is disabled. */
export const ReadOnly: Story = {
  render: () => <DemoGrid seed={clone()} readOnly withGhost={false} withPeek={false} />
}

/** Loading skeleton shown while the database hydrates. */
export const LoadingSkeleton: Story = {
  render: () => <GridSkeleton />
}
