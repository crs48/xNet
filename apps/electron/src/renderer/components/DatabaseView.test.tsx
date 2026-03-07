/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, beforeEach, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { DatabaseView } from './DatabaseView'

const mockUpdate = vi.fn()
const mockCreate = vi.fn()
const mockCreateColumn = vi.fn()
const mockUpdateColumn = vi.fn()
const mockDeleteColumn = vi.fn()
const mockCreateView = vi.fn()
const mockUpdateView = vi.fn()
const mockCreateRow = vi.fn()
const mockUpdateRow = vi.fn()
const mockDeleteRow = vi.fn()
const mockReorderRow = vi.fn()

const mockUseNode = vi.fn()
const mockUseDatabaseDoc = vi.fn()
const mockUseDatabase = vi.fn()
const mockUseIdentity = vi.fn()
const mockUseMutate = vi.fn()
const mockUseQuery = vi.fn()
const mockUseDatabaseComments = vi.fn()
const mockUseUndoScope = vi.fn()

vi.mock('@xnetjs/data', () => ({
  DatabaseSchema: {
    schema: {
      '@id': 'xnet://schema/database'
    }
  },
  decodeAnchor: vi.fn(() => ({})),
  buildDatabaseSchema: vi.fn((docId: string) => ({
    '@id': `xnet://schema/${docId}`
  })),
  createInitialSchemaMetadata: vi.fn((name: string) => ({
    version: 1,
    name,
    createdAt: 0,
    updatedAt: 0,
    history: []
  })),
  bumpSchemaVersion: vi.fn((metadata: { version: number }) => ({
    ...metadata,
    version: metadata.version + 1
  })),
  getVersionBumpType: vi.fn(() => 'minor'),
  cloneSchema: vi.fn((columns: unknown[]) => columns),
  createVersionEntry: vi.fn(() => ({
    version: 1,
    timestamp: 0,
    changes: []
  })),
  pruneVersionHistory: vi.fn((history: unknown[]) => history)
}))

vi.mock('@xnetjs/react', () => ({
  useDatabaseDoc: (...args: unknown[]) => mockUseDatabaseDoc(...args),
  useDatabase: (...args: unknown[]) => mockUseDatabase(...args),
  useNode: (...args: unknown[]) => mockUseNode(...args),
  useIdentity: (...args: unknown[]) => mockUseIdentity(...args),
  useMutate: (...args: unknown[]) => mockUseMutate(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args)
}))

vi.mock('@xnetjs/react/internal', () => ({
  useUndoScope: (...args: unknown[]) => mockUseUndoScope(...args)
}))

vi.mock('@xnetjs/views', () => ({
  TableView: () => <div data-testid="table-view">table view</div>,
  BoardView: () => <div data-testid="board-view">board view</div>,
  CardDetailModal: () => null,
  AddColumnModal: () => null,
  SchemaInfoModal: () => null,
  CloneSchemaModal: () => null,
  useDatabaseComments: (...args: unknown[]) => mockUseDatabaseComments(...args)
}))

vi.mock('@xnetjs/ui', async () => {
  const ReactModule = await import('react')

  function Menu({
    trigger,
    children
  }: {
    trigger: React.ReactNode
    children: React.ReactNode
  }): React.ReactElement {
    const [open, setOpen] = ReactModule.useState(false)

    if (!ReactModule.isValidElement(trigger)) {
      return <div>{children}</div>
    }

    return (
      <div>
        {ReactModule.cloneElement(trigger, {
          onClick: () => setOpen((prev) => !prev)
        })}
        {open ? <div data-testid="mock-menu">{children}</div> : null}
      </div>
    )
  }

  return {
    CommentPopover: () => null,
    CommentsSidebar: ({ open }: { open: boolean }) => (
      <div data-testid="comments-sidebar">{open ? 'open' : 'closed'}</div>
    ),
    Menu,
    MenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
      <button type="button" onClick={onSelect}>
        {children}
      </button>
    ),
    MenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuSeparator: () => <hr />
  }
})

vi.mock('./ShareButton', () => ({
  ShareButton: ({ docId }: { docId: string }) => (
    <button type="button" data-testid="share-button">
      Share {docId}
    </button>
  )
}))

vi.mock('./PresenceAvatars', () => ({
  PresenceAvatars: () => <div data-testid="presence-avatars">presence</div>
}))

function createAwarenessMock() {
  return {
    clientID: 1,
    getStates: () => new Map<number, Record<string, unknown>>(),
    setLocalStateField: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}

function createDatabaseDoc(): Y.Doc {
  const doc = new Y.Doc()
  const dataMap = doc.getMap('data')

  dataMap.set('columns', [
    {
      id: 'title',
      name: 'Title',
      type: 'text'
    },
    {
      id: 'status',
      name: 'Status',
      type: 'select',
      config: {
        options: [
          { id: 'todo', name: 'Todo' },
          { id: 'done', name: 'Done' }
        ]
      }
    }
  ])
  dataMap.set('schema', {
    version: 1,
    name: 'Focus DB',
    createdAt: 0,
    updatedAt: 0,
    history: []
  })

  return doc
}

const mockColumns = [
  {
    id: 'title',
    name: 'Title',
    type: 'text' as const,
    width: 240,
    config: {}
  },
  {
    id: 'status',
    name: 'Status',
    type: 'select' as const,
    width: 140,
    config: {
      options: [
        { id: 'todo', name: 'Todo' },
        { id: 'done', name: 'Done' }
      ]
    }
  }
]

const mockViews = [
  {
    id: 'table-view',
    name: 'Table View',
    type: 'table' as const,
    visibleColumns: ['title', 'status'],
    columnWidths: { title: 240, status: 140 },
    sorts: []
  },
  {
    id: 'board-view',
    name: 'Board View',
    type: 'board' as const,
    visibleColumns: ['title', 'status'],
    sorts: [],
    groupBy: 'status'
  }
]

const mockRows = [
  {
    id: 'row-1',
    cells: {
      title: 'First row',
      status: 'todo'
    }
  }
]

describe('DatabaseView minimal chrome', () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockCreate.mockReset()
    mockCreateColumn.mockReset()
    mockUpdateColumn.mockReset()
    mockDeleteColumn.mockReset()
    mockCreateView.mockReset()
    mockUpdateView.mockReset()
    mockCreateRow.mockReset()
    mockUpdateRow.mockReset()
    mockDeleteRow.mockReset()
    mockReorderRow.mockReset()

    mockUseIdentity.mockReturnValue({ did: 'did:xnet:test' })
    mockUseMutate.mockReturnValue({ create: mockCreate })
    mockUseQuery.mockReturnValue({ data: [] })
    mockUseUndoScope.mockReturnValue({
      undo: vi.fn(async () => false),
      redo: vi.fn(async () => false),
      canUndo: false,
      canRedo: false
    })
    mockUseDatabaseComments.mockReturnValue({
      threads: [],
      cellCommentCounts: new Map(),
      unresolvedCount: 2,
      commentOnCell: vi.fn(),
      getThreadsForCell: vi.fn(() => []),
      replyTo: vi.fn(),
      resolveThread: vi.fn(),
      reopenThread: vi.fn(),
      deleteComment: vi.fn(),
      editComment: vi.fn()
    })
    mockUseNode.mockReturnValue({
      data: { title: 'Focus DB' },
      loading: false,
      update: mockUpdate,
      presence: [{ did: 'did:xnet:peer', color: '#22c55e' }],
      awareness: createAwarenessMock()
    })
    mockUseDatabaseDoc.mockReturnValue({
      columns: mockColumns,
      views: mockViews,
      doc: createDatabaseDoc(),
      loading: false,
      createColumn: mockCreateColumn,
      updateColumn: mockUpdateColumn,
      deleteColumn: mockDeleteColumn,
      createView: mockCreateView,
      updateView: mockUpdateView
    })
    mockUseDatabase.mockReturnValue({
      rows: mockRows,
      loading: false,
      createRow: mockCreateRow,
      updateRow: mockUpdateRow,
      deleteRow: mockDeleteRow,
      reorderRow: mockReorderRow
    })
  })

  it('renders the compact focus controls and moves sharing into the overflow menu', async () => {
    render(<DatabaseView docId="db-1" minimalChrome />)

    expect(await screen.findByDisplayValue('Focus DB')).toBeTruthy()
    expect(screen.getByTestId('presence-avatars')).toBeTruthy()
    expect(screen.getByRole('button', { name: /add row/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /comments/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open database actions/i })).toBeTruthy()
    expect(screen.queryByTestId('share-button')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /open database actions/i }))

    expect(screen.getByText('Schema info')).toBeTruthy()
    expect(screen.getByText('Clone schema')).toBeTruthy()
    expect(screen.getByTestId('share-button')).toBeTruthy()
  })

  it('keeps comments accessible from the compact toolbar', async () => {
    render(<DatabaseView docId="db-1" minimalChrome />)

    expect((await screen.findByTestId('comments-sidebar')).textContent).toContain('closed')

    fireEvent.click(screen.getByRole('button', { name: /comments/i }))

    expect(screen.getByTestId('comments-sidebar').textContent).toContain('open')
  })

  it('preserves the richer header outside focused mode', async () => {
    render(<DatabaseView docId="db-1" />)

    expect(await screen.findByDisplayValue('Focus DB')).toBeTruthy()
    expect(screen.getByTestId('share-button')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open database actions/i })).toBeNull()
  })
})
