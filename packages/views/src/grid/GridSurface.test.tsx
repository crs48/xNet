/**
 * GridSurface component tests — click/keyboard interaction paths,
 * editing lifecycle, clipboard, and structural callbacks.
 */

import type { GridField, GridRowData } from './model'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GridSurface } from './GridSurface'

// ─── jsdom sizing so TanStack Virtual renders rows ──────────────────────────

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  // TanStack Virtual measures via offsetWidth/offsetHeight (zero in jsdom)
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 800
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1200
  })
  Element.prototype.getBoundingClientRect = function () {
    return {
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect
  }
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  vi.unstubAllGlobals()
})

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fields: GridField[] = [
  { id: 'name', name: 'Name', type: 'text', config: {}, width: 200, isTitle: true },
  { id: 'count', name: 'Count', type: 'number', config: {}, width: 100 },
  {
    id: 'status',
    name: 'Status',
    type: 'select',
    config: {},
    width: 140,
    options: [
      { id: 'o1', name: 'Todo', color: 'gray' },
      { id: 'o2', name: 'Done', color: 'green' }
    ]
  }
]

const rows: GridRowData[] = [
  { id: 'r1', cells: { name: 'Alpha', count: 1, status: 'o1' } },
  { id: 'r2', cells: { name: 'Beta', count: 2, status: 'o2' } },
  { id: 'r3', cells: { name: 'Gamma', count: 3 } }
]

function cell(row: number, col: number): HTMLElement {
  const el = document.querySelector(
    `[data-row-index="${row}"][data-col-index="${col}"]`
  ) as HTMLElement
  expect(el).toBeTruthy()
  return el
}

function gridEl(): HTMLElement {
  return document.querySelector('[data-xnet-grid]') as HTMLElement
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GridSurface', () => {
  it('renders rows, cells, and the footer count', () => {
    render(<GridSurface fields={fields} rows={rows} />)
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Gamma')).toBeTruthy()
    expect(screen.getByText('3 rows')).toBeTruthy()
    expect(gridEl().getAttribute('aria-colcount')).toBe('3')
  })

  it('click focuses a cell; arrows move the cursor', () => {
    render(<GridSurface fields={fields} rows={rows} />)
    fireEvent.mouseDown(cell(0, 0))
    expect(cell(0, 0).className).toContain('ring-2')

    fireEvent.keyDown(gridEl(), { key: 'ArrowDown' })
    expect(cell(1, 0).className).toContain('ring-2')

    fireEvent.keyDown(gridEl(), { key: 'ArrowRight' })
    expect(cell(1, 1).className).toContain('ring-2')
  })

  it('shift+arrow extends a range; cells get aria-selected', () => {
    render(<GridSurface fields={fields} rows={rows} />)
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(gridEl(), { key: 'ArrowRight', shiftKey: true })

    expect(cell(0, 0).getAttribute('aria-selected')).toBe('true')
    expect(cell(1, 1).getAttribute('aria-selected')).toBe('true')
    expect(cell(2, 2).getAttribute('aria-selected')).toBe('false')
  })

  it('Enter starts editing and commits via Enter, moving down', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })

    const input = cell(0, 0).querySelector('input, textarea') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Alpha2' } })
    fireEvent.keyDown(gridEl(), { key: 'Enter' })

    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'name', 'Alpha2')
    // Cursor moved down
    expect(cell(1, 0).className).toContain('ring-2')
  })

  it('typing a character starts a replace-edit seeded with that character', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Z' })

    const input = cell(0, 0).querySelector('input, textarea') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Z')

    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'name', 'Z')
  })

  it('Escape cancels an edit without persisting', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    const input = cell(0, 0).querySelector('input, textarea') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'discarded' } })
    fireEvent.keyDown(gridEl(), { key: 'Escape' })

    expect(onUpdateCell).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha')).toBeTruthy()
  })

  it('Tab commits and moves right', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    fireEvent.keyDown(gridEl(), { key: 'Tab' })

    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'name', 'Alpha')
    expect(cell(0, 1).className).toContain('ring-2')
  })

  it('Delete clears the selected range', () => {
    const onClearCells = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onClearCells={onClearCells} />)

    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(gridEl(), { key: 'Delete' })

    expect(onClearCells).toHaveBeenCalledWith([
      { rowId: 'r1', fieldId: 'name' },
      { rowId: 'r2', fieldId: 'name' }
    ])
  })

  it('copy writes TSV to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText, readText: vi.fn() } })

    render(<GridSurface fields={fields} rows={rows} />)
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(gridEl(), { key: 'ArrowRight', shiftKey: true })
    await act(async () => {
      fireEvent.keyDown(gridEl(), { key: 'c', metaKey: true })
    })

    expect(writeText).toHaveBeenCalledWith('Alpha\t1\nBeta\t2')
  })

  it('paste coerces values per field type', async () => {
    const onUpdateCell = vi.fn()
    const readText = vi.fn().mockResolvedValue('Delta\t42\nEpsilon\t7')
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } })

    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)
    fireEvent.mouseDown(cell(1, 0))
    await act(async () => {
      fireEvent.keyDown(gridEl(), { key: 'v', metaKey: true })
    })

    expect(onUpdateCell).toHaveBeenCalledWith('r2', 'name', 'Delta')
    expect(onUpdateCell).toHaveBeenCalledWith('r2', 'count', 42)
    expect(onUpdateCell).toHaveBeenCalledWith('r3', 'name', 'Epsilon')
    expect(onUpdateCell).toHaveBeenCalledWith('r3', 'count', 7)
  })

  it('paste resolves select option names and creates unknown ones inline', async () => {
    const onUpdateCell = vi.fn()
    const onCreateOption = vi.fn().mockResolvedValue('o-new')
    const readText = vi.fn().mockResolvedValue('Done\nUrgent')
    Object.assign(navigator, { clipboard: { writeText: vi.fn(), readText } })

    render(
      <GridSurface
        fields={fields}
        rows={rows}
        onUpdateCell={onUpdateCell}
        onCreateOption={onCreateOption}
      />
    )
    fireEvent.mouseDown(cell(0, 2))
    await act(async () => {
      fireEvent.keyDown(gridEl(), { key: 'v', metaKey: true })
    })

    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'status', 'o2')
    expect(onCreateOption).toHaveBeenCalledWith('status', 'Urgent')
    expect(onUpdateCell).toHaveBeenCalledWith('r2', 'status', 'o-new')
  })

  it('Cmd+D fills down from the top of the selection', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 1))
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(gridEl(), { key: 'd', metaKey: true })

    expect(onUpdateCell).toHaveBeenCalledWith('r2', 'count', 1)
    expect(onUpdateCell).toHaveBeenCalledWith('r3', 'count', 1)
  })

  it('undo/redo shortcuts call through', () => {
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUndo={onUndo} onRedo={onRedo} />)
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'z', metaKey: true })
    fireEvent.keyDown(gridEl(), { key: 'z', metaKey: true, shiftKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('header click toggles sort; sort indicator renders', () => {
    const onToggleSort = vi.fn()
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        onToggleSort={onToggleSort}
        sorts={[{ columnId: 'name', direction: 'asc' }]}
      />
    )
    expect(screen.getByTestId('sort-asc-name')).toBeTruthy()
    fireEvent.click(screen.getByText('Count'))
    expect(onToggleSort).toHaveBeenCalledWith('count')
  })

  it('row gutter click selects the row', () => {
    render(<GridSurface fields={fields} rows={rows} />)
    const rowEl = document.querySelector('[data-row-id="r2"]') as HTMLElement
    const gutter = rowEl.firstElementChild as HTMLElement
    fireEvent.click(gutter)
    expect(cell(1, 0).getAttribute('aria-selected')).toBe('true')
    expect(cell(1, 2).getAttribute('aria-selected')).toBe('true')
    expect(cell(0, 0).getAttribute('aria-selected')).toBe('false')
  })

  it('expand button opens the row', () => {
    const onOpenRow = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onOpenRow={onOpenRow} />)
    const rowEl = document.querySelector('[data-row-id="r1"]') as HTMLElement
    fireEvent.click(rowEl.querySelector('[aria-label="Open row"]') as HTMLElement)
    expect(onOpenRow).toHaveBeenCalledWith('r1')
  })

  it('Space opens peek for the cursor row', () => {
    const onOpenRow = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onOpenRow={onOpenRow} />)
    fireEvent.mouseDown(cell(2, 0))
    fireEvent.keyDown(gridEl(), { key: ' ' })
    expect(onOpenRow).toHaveBeenCalledWith('r3')
  })

  it('footer + New adds a row; Cmd+Shift+, inserts below cursor', () => {
    const onAddRow = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onAddRow={onAddRow} />)
    fireEvent.click(screen.getByText('New'))
    expect(onAddRow).toHaveBeenCalledWith()

    fireEvent.mouseDown(cell(1, 0))
    fireEvent.keyDown(gridEl(), { key: '<', metaKey: true, shiftKey: true })
    expect(onAddRow).toHaveBeenCalledWith('r2')
  })

  it('presence renders a ring and name flag', () => {
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        presences={[
          { rowId: 'r1', columnId: 'name', color: '#f00', did: 'did:key:z1', name: 'Bob' }
        ]}
      />
    )
    expect(screen.getByText('Bob')).toBeTruthy()
    expect((cell(0, 0) as HTMLElement).style.boxShadow).toContain('#f00')
  })

  it('comment badges render counts and invoke the callback', () => {
    const onCommentCell = vi.fn()
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        cellCommentCounts={new Map([['r1:name', 2]])}
        onCommentCell={onCommentCell}
      />
    )
    const badge = screen.getByLabelText('2 comments')
    fireEvent.click(badge)
    expect(onCommentCell).toHaveBeenCalledWith('r1', 'name', expect.anything())
  })

  it('readOnly suppresses editing', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} readOnly onUpdateCell={onUpdateCell} />)
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(cell(0, 0).querySelector('input, textarea')).toBeNull()
  })

  it('a structurally readonly column is not editable, but sibling columns are', () => {
    const onUpdateCell = vi.fn()
    const lockedFields: GridField[] = [
      {
        id: 'name',
        name: 'Name',
        type: 'text',
        config: {},
        width: 200,
        isTitle: true,
        readonly: true
      },
      { id: 'done', name: 'Done', type: 'checkbox', config: {}, width: 80, readonly: true },
      { id: 'count', name: 'Count', type: 'number', config: {}, width: 100 }
    ]
    const lockedRows: GridRowData[] = [
      { id: 'r1', cells: { name: 'Alpha', done: false, count: 1 } }
    ]
    render(<GridSurface fields={lockedFields} rows={lockedRows} onUpdateCell={onUpdateCell} />)

    // Locked text column: Enter does not open an editor.
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(cell(0, 0).querySelector('input, textarea')).toBeNull()

    // Locked checkbox column: Enter does not toggle it.
    fireEvent.mouseDown(cell(0, 1))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(onUpdateCell).not.toHaveBeenCalled()

    // An unlocked sibling column still edits.
    fireEvent.mouseDown(cell(0, 2))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(cell(0, 2).querySelector('input, textarea')).toBeTruthy()
  })

  it('a per-cell lock (cellLockReasons) blocks editing that one cell and shows its reason', () => {
    const onUpdateCell = vi.fn()
    const locks = new Map<string, string>([['r1:name', "You can't edit this node"]])
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        onUpdateCell={onUpdateCell}
        cellLockReasons={locks}
      />
    )

    // Locked cell: Enter and double-click do not open an editor.
    fireEvent.mouseDown(cell(0, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(cell(0, 0).querySelector('input, textarea')).toBeNull()
    fireEvent.doubleClick(cell(0, 0))
    expect(cell(0, 0).querySelector('input, textarea')).toBeNull()
    // The reason is exposed (title) on the cell.
    expect(cell(0, 0).getAttribute('title')).toBe("You can't edit this node")

    // The same column on an unlocked row still edits.
    fireEvent.mouseDown(cell(1, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(cell(1, 0).querySelector('input, textarea')).toBeTruthy()
  })

  it('shows a read-only reason tooltip + lock glyph for opt-in read-only columns while editing', () => {
    const fieldsWithReason: GridField[] = [
      { id: 'name', name: 'Name', type: 'text', config: {}, width: 200, isTitle: true },
      {
        id: 'sys',
        name: 'System',
        type: 'text',
        config: {},
        width: 120,
        readonly: true,
        readonlyReason: 'System field — read-only'
      }
    ]
    render(<GridSurface fields={fieldsWithReason} rows={rows} onUpdateCell={vi.fn()} />)

    // The read-only column carries its reason as a hover tooltip...
    expect(cell(0, 1).getAttribute('title')).toBe('System field — read-only')
    // ...and a lock glyph marks it while the grid is editable.
    expect(cell(0, 1).querySelector('[aria-label="read-only"]')).toBeTruthy()
    // The editable column has neither.
    expect(cell(0, 0).getAttribute('title')).toBeNull()
    expect(cell(0, 0).querySelector('[aria-label="read-only"]')).toBeNull()
  })

  it('does not clutter a fully read-only grid with lock glyphs', () => {
    const fieldsWithReason: GridField[] = [
      {
        id: 'sys',
        name: 'System',
        type: 'text',
        config: {},
        width: 120,
        isTitle: true,
        readonly: true,
        readonlyReason: 'System field — read-only'
      }
    ]
    // Whole grid read-only (editing off): the reason still shows on hover, but
    // no glyph (every cell would otherwise be marked).
    render(<GridSurface fields={fieldsWithReason} rows={rows} readOnly />)
    expect(cell(0, 0).getAttribute('title')).toBe('System field — read-only')
    expect(cell(0, 0).querySelector('[aria-label="read-only"]')).toBeNull()
  })

  it('broadcasts cell focus for presence', () => {
    const onCellFocus = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onCellFocus={onCellFocus} />)
    fireEvent.mouseDown(cell(1, 1))
    expect(onCellFocus).toHaveBeenCalledWith('r2', 'count')
  })

  // ─── Windowed rows: footer totals + infinite scroll (exploration 0340) ────

  it('footer shows "N of M rows" when the loaded window is smaller than the table', () => {
    render(<GridSurface fields={fields} rows={rows} totalRowCount={12000} hasMoreRows />)
    expect(screen.getByTestId('grid-row-count').textContent).toContain('3 of 12,000 rows')
  })

  it('footer shows the plain count when the window covers the whole table', () => {
    render(<GridSurface fields={fields} rows={rows} totalRowCount={3} />)
    expect(screen.getByTestId('grid-row-count').textContent).toBe('3 rows')
  })

  it('footer appends the loading hint and notice', () => {
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        totalRowCount={500}
        hasMoreRows
        loadingMoreRows
        footerNotice="filtered within loaded rows"
      />
    )
    const text = screen.getByTestId('grid-row-count').textContent ?? ''
    expect(text).toContain('3 of 500 rows')
    expect(text).toContain('loading more…')
    expect(text).toContain('filtered within loaded rows')
  })

  it('calls onReachEnd when the rendered window reaches the end of loaded rows', () => {
    const onReachEnd = vi.fn()
    // 30 rows in an 800px viewport: the virtualizer renders to the end, which
    // is within the reach-end threshold — the sentinel fires once.
    const manyRows: GridRowData[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      cells: { name: `Row ${i}`, count: i }
    }))
    render(<GridSurface fields={fields} rows={manyRows} hasMoreRows onReachEnd={onReachEnd} />)
    expect(onReachEnd).toHaveBeenCalledTimes(1)
  })

  it('does not call onReachEnd when there are no more rows or while loading', () => {
    const onReachEnd = vi.fn()
    const manyRows: GridRowData[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m${i}`,
      cells: { name: `Row ${i}`, count: i }
    }))
    const { unmount } = render(
      <GridSurface fields={fields} rows={manyRows} onReachEnd={onReachEnd} />
    )
    expect(onReachEnd).not.toHaveBeenCalled()
    unmount()
    render(
      <GridSurface
        fields={fields}
        rows={manyRows}
        hasMoreRows
        loadingMoreRows
        onReachEnd={onReachEnd}
      />
    )
    expect(onReachEnd).not.toHaveBeenCalled()
  })

  it('keyboard navigation works across a virtualized column window', () => {
    // 40 columns crosses the virtualization threshold; the cursor cell must
    // stay reachable as it moves beyond the initially rendered window.
    const wideFields: GridField[] = Array.from({ length: 40 }, (_, i) => ({
      id: `f${i}`,
      name: `Col ${i}`,
      type: 'text' as const,
      config: {},
      width: 150,
      ...(i === 0 ? { isTitle: true } : {})
    }))
    const wideRows: GridRowData[] = Array.from({ length: 3 }, (_, r) => ({
      id: `w${r}`,
      cells: Object.fromEntries(wideFields.map((f, c) => [f.id, `r${r}c${c}`]))
    }))
    render(<GridSurface fields={wideFields} rows={wideRows} />)

    // Only a window of the 40 columns is rendered
    const firstRow = document.querySelector('[data-grid-body] [role="row"]') as HTMLElement
    expect(firstRow.querySelectorAll('[data-grid-cell]').length).toBeLessThan(40)

    // Cursor moves right; the grid keeps a focused cell rendered at each step
    fireEvent.mouseDown(cell(0, 0))
    const grid = gridEl()
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(grid, { key: 'ArrowRight' })
    }
    expect(document.querySelector('[data-row-index="0"][data-col-index="5"]')).toBeTruthy()
  })
})
