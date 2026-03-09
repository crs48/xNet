import type { TableRow } from './table/useTableState'
import type { CellPresence, ViewConfig } from './types'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Schema } from '@xnetjs/data'
import { Badge, Button } from '@xnetjs/ui'
import { LayoutGrid, Table as TableIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { BoardView } from './board/BoardView'
import { CardDetailModal } from './card-detail/CardDetailModal'
import { TableView } from './table/TableView'

const meta = {
  title: 'Core/Database/Surface'
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>
type SurfaceMode = 'table' | 'board'

const schema: Schema = {
  '@id': 'xnet://storybook/DatabaseSurface' as const,
  '@type': 'xnet://xnet.fyi/Schema' as const,
  name: 'DatabaseSurface',
  namespace: 'xnet://storybook/' as const,
  version: '1.0.0',
  properties: [
    {
      '@id': 'xnet://storybook/DatabaseSurface#title',
      name: 'Title',
      type: 'text',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/DatabaseSurface#status',
      name: 'Status',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: 'gray' },
          { id: 'in-progress', name: 'In Progress', color: 'blue' },
          { id: 'review', name: 'In Review', color: 'yellow' },
          { id: 'done', name: 'Done', color: 'green' }
        ]
      }
    },
    {
      '@id': 'xnet://storybook/DatabaseSurface#owner',
      name: 'Owner',
      type: 'text',
      required: false,
      config: {}
    },
    {
      '@id': 'xnet://storybook/DatabaseSurface#priority',
      name: 'Priority',
      type: 'select',
      required: false,
      config: {
        options: [
          { id: 'low', name: 'Low', color: 'gray' },
          { id: 'medium', name: 'Medium', color: 'yellow' },
          { id: 'high', name: 'High', color: 'red' }
        ]
      }
    },
    {
      '@id': 'xnet://storybook/DatabaseSurface#estimate',
      name: 'Estimate',
      type: 'number',
      required: false,
      config: {}
    }
  ]
}

const initialRows: TableRow[] = [
  {
    id: 'row-1',
    title: 'Ship embedded Storybook in Electron',
    status: 'in-progress',
    owner: 'Desktop',
    priority: 'high',
    estimate: 5
  },
  {
    id: 'row-2',
    title: 'Add canvas workbench stories',
    status: 'todo',
    owner: 'Canvas',
    priority: 'medium',
    estimate: 3
  },
  {
    id: 'row-3',
    title: 'Profile heavy component renders',
    status: 'review',
    owner: 'UI',
    priority: 'high',
    estimate: 2
  },
  {
    id: 'row-4',
    title: 'Document Storybook workflow',
    status: 'done',
    owner: 'Docs',
    priority: 'low',
    estimate: 1
  }
]

const tableView: ViewConfig = {
  id: 'table-view',
  name: 'Table View',
  type: 'table',
  visibleProperties: ['title', 'status', 'owner', 'priority', 'estimate'],
  propertyWidths: {
    title: 320,
    status: 160,
    owner: 180,
    priority: 140,
    estimate: 120
  },
  sorts: []
}

const boardView: ViewConfig = {
  id: 'board-view',
  name: 'Board View',
  type: 'board',
  visibleProperties: ['title', 'owner', 'priority', 'estimate'],
  sorts: [],
  groupByProperty: 'status'
}

const cellPresences: CellPresence[] = [
  {
    rowId: 'row-1',
    columnId: 'status',
    color: '#0ea5e9',
    did: 'did:key:z6Mkchris',
    name: 'Chris'
  },
  {
    rowId: 'row-3',
    columnId: 'title',
    color: '#f97316',
    did: 'did:key:z6Mkpat',
    name: 'Pat'
  }
]

function DatabaseSurfacePlayground(): ReactElement {
  const [rows, setRows] = useState<TableRow[]>(initialRows)
  const [mode, setMode] = useState<SurfaceMode>('table')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [lastCommentCell, setLastCommentCell] = useState<string | null>('row-1:title')

  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? null
  const commentCounts = new Map<string, number>([
    ['row-1:title', 3],
    ['row-3:title', 1],
    ['row-2:status', 2]
  ])

  const updateRow = (rowId: string, propertyId: string, value: unknown): void => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [propertyId]: value } : row))
    )
  }

  const addRow = (): void => {
    const nextIndex = rows.length + 1

    setRows((current) => [
      ...current,
      {
        id: `row-${nextIndex}`,
        title: `New record ${nextIndex}`,
        status: 'todo',
        owner: 'Storybook',
        priority: 'medium',
        estimate: 1
      }
    ])
  }

  const deleteRow = (rowId: string): void => {
    setRows((current) => current.filter((row) => row.id !== rowId))
    setSelectedRowId((current) => (current === rowId ? null : current))
  }

  const reorderRows = (rowIds: string[]): void => {
    const order = new Map(rowIds.map((id, index) => [id, index]))

    setRows((current) =>
      [...current].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border bg-background-subtle px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Database workbench</p>
          <p className="text-sm text-foreground-muted">
            Test table editing, board drag-and-drop, inline comments, and card detail editing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{rows.length} rows</Badge>
          <Button
            variant={mode === 'table' ? 'default' : 'outline'}
            size="sm"
            leftIcon={<TableIcon className="h-4 w-4" />}
            onClick={() => setMode('table')}
          >
            Table
          </Button>
          <Button
            variant={mode === 'board' ? 'default' : 'outline'}
            size="sm"
            leftIcon={<LayoutGrid className="h-4 w-4" />}
            onClick={() => setMode('board')}
          >
            Board
          </Button>
          <Button variant="outline" size="sm" onClick={addRow}>
            Add row
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-[760px] overflow-hidden rounded-[28px] border border-border bg-background shadow-sm">
          {mode === 'table' ? (
            <TableView
              schema={schema}
              view={tableView}
              data={rows}
              onUpdateRow={updateRow}
              onAddRow={addRow}
              onDeleteRow={deleteRow}
              cellPresences={cellPresences}
              cellCommentCounts={commentCounts}
              onCommentClick={(rowId, propertyKey) => setLastCommentCell(`${rowId}:${propertyKey}`)}
              onCommentCreate={(rowId, propertyKey) =>
                setLastCommentCell(`${rowId}:${propertyKey}`)
              }
            />
          ) : (
            <BoardView
              schema={schema}
              view={boardView}
              data={rows}
              onUpdateRow={updateRow}
              onAddCard={(columnId) => {
                setRows((current) => [
                  ...current,
                  {
                    id: `row-${current.length + 1}`,
                    title: `New ${columnId} card`,
                    status: columnId,
                    owner: 'Storybook',
                    priority: 'medium',
                    estimate: 2
                  }
                ])
              }}
              onCardClick={(rowId) => setSelectedRowId(rowId)}
              onReorderCards={reorderRows}
            />
          )}
        </div>

        <aside className="space-y-4 rounded-[28px] border border-border bg-background-subtle p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">What to test here</p>
            <p className="mt-1 text-sm text-foreground-muted">
              Inline cell editing, virtualization, board drag-and-drop, and card detail updates.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            Last comment interaction:{' '}
            <span className="font-medium text-foreground">{lastCommentCell ?? 'none yet'}</span>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 text-sm text-foreground-muted">
            Click a board card to open the detail modal, or edit cells directly in table mode.
          </div>
        </aside>
      </div>

      <CardDetailModal
        isOpen={selectedRow !== null}
        row={selectedRow}
        schema={schema}
        onClose={() => setSelectedRowId(null)}
        onUpdateRow={updateRow}
        onDeleteRow={deleteRow}
      />
    </div>
  )
}

export const Playground: Story = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Interactive database surface for exercising the shared table view, board view, inline editing, comment badges, and card detail modal.'
      }
    }
  },
  render: () => <DatabaseSurfacePlayground />
}
