/**
 * @vitest-environment jsdom
 *
 * DatabaseView (V2 shell) — renders the grid from useGridDatabase models
 * and routes mutations through the hook.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, beforeEach, expect, it, vi } from 'vitest'
import { DatabaseView } from './DatabaseView'

// ─── jsdom sizing so TanStack Virtual renders rows ──────────────────────────

class ResizeObserverStub {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 800
})
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 1200
})

// ─── Hook mocks ──────────────────────────────────────────────────────────────

const mockAddRow = vi.fn()
const mockUpdateCell = vi.fn()
const mockToggleSort = vi.fn()

const fields = [
  {
    id: 'f-title',
    name: 'Name',
    type: 'text',
    config: {},
    sortKey: 'a0',
    width: 200,
    isTitle: true
  },
  { id: 'f-status', name: 'Status', type: 'select', config: {}, sortKey: 'a1', width: 140 }
]

const view = {
  id: 'v-1',
  name: 'Table',
  type: 'table',
  filters: null,
  sorts: [],
  groupBy: null,
  collapsedGroups: [],
  fieldOrder: {},
  fieldWidths: {},
  hiddenFields: [],
  sortKey: 'a0'
}

const gridResult = {
  database: { id: 'db-1', title: 'Tasks' },
  fields,
  visibleFields: fields,
  views: [view],
  activeView: view,
  rows: [
    { id: 'r-1', sortKey: 'a0', cells: { 'f-title': 'Ship grid', 'f-status': null } },
    { id: 'r-2', sortKey: 'a1', cells: { 'f-title': 'Write tests', 'f-status': null } }
  ],
  loading: false,
  updateCell: mockUpdateCell,
  clearCells: vi.fn(),
  addRow: mockAddRow,
  deleteRows: vi.fn(),
  moveRowToIndex: vi.fn(),
  addField: vi.fn(),
  renameField: vi.fn(),
  updateFieldConfig: vi.fn(),
  changeFieldType: vi.fn(),
  removeField: vi.fn(),
  moveFieldToIndex: vi.fn(),
  resizeField: vi.fn(),
  setFieldHidden: vi.fn(),
  createOption: vi.fn(),
  toggleSort: mockToggleSort,
  setFilters: vi.fn(),
  setGroupBy: vi.fn(),
  addView: vi.fn(),
  renameView: vi.fn(),
  removeView: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: false,
  canRedo: false
}

vi.mock('./ShareButton', () => ({
  ShareButton: () => <div data-testid="share-button" />
}))

vi.mock('./PresenceAvatars', () => ({
  PresenceAvatars: () => <div data-testid="presence-avatars" />
}))

vi.mock('@xnetjs/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xnetjs/react')
  return {
    ...actual,
    useGridDatabase: () => gridResult,
    useIdentity: () => ({ did: 'did:key:ztest' }),
    useNode: () => ({
      data: { id: 'db-1', title: 'Tasks' },
      loading: false,
      update: vi.fn(),
      presence: [],
      awareness: null
    })
  }
})

vi.mock('@xnetjs/views', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xnetjs/views')
  return {
    ...actual,
    useDatabaseComments: () => ({
      threads: [],
      count: 0,
      unresolvedCount: 0,
      loading: false,
      error: null,
      cellCommentCounts: new Map(),
      rowCommentCounts: new Map(),
      columnCommentCounts: new Map(),
      commentOnCell: vi.fn(),
      commentOnRow: vi.fn(),
      commentOnColumn: vi.fn(),
      getThreadsForCell: () => [],
      getThreadsForRow: () => [],
      getThreadsForColumn: () => []
    })
  }
})

describe('DatabaseView (V2 shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the grid with fields, rows, and view tabs', () => {
    render(<DatabaseView docId="db-1" />)
    expect(screen.getByText('Ship grid')).toBeTruthy()
    expect(screen.getByText('Write tests')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Table' })).toBeTruthy()
    expect(screen.getByText('2 rows')).toBeTruthy()
  })

  it('adds a row from the footer button', () => {
    render(<DatabaseView docId="db-1" />)
    fireEvent.click(screen.getByText('New'))
    expect(mockAddRow).toHaveBeenCalled()
  })

  it('header click toggles sort through the hook', () => {
    render(<DatabaseView docId="db-1" />)
    fireEvent.click(screen.getByText('Status'))
    expect(mockToggleSort).toHaveBeenCalledWith('f-status')
  })

  it('minimalChrome hides the title header', () => {
    render(<DatabaseView docId="db-1" minimalChrome />)
    expect(screen.queryByDisplayValue('Tasks')).toBeNull()
    expect(screen.getByText('Ship grid')).toBeTruthy()
  })

  it('cell edits route through updateCell', () => {
    render(<DatabaseView docId="db-1" />)
    const cell = document.querySelector(
      '[data-row-id="r-1"][data-field-id="f-title"]'
    ) as HTMLElement
    fireEvent.mouseDown(cell)
    fireEvent.doubleClick(cell)
    const input = cell.querySelector('input, textarea') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Ship grid v2' } })
    const grid = document.querySelector('[data-xnet-grid]') as HTMLElement
    fireEvent.keyDown(grid, { key: 'Enter' })
    expect(mockUpdateCell).toHaveBeenCalledWith('r-1', 'f-title', 'Ship grid v2')
  })
})
