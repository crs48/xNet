/**
 * Spreadsheet-style ghost cells — typing in the empty row at the bottom
 * creates a row; typing in the empty column at the right creates a field.
 */

import type { GridField, GridRowData } from './model'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GridSurface } from './GridSurface'

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
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 800
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1200
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const fields: GridField[] = [
  { id: 'name', name: 'Name', type: 'text', config: {}, width: 200, isTitle: true },
  { id: 'count', name: 'Count', type: 'number', config: {}, width: 100 }
]

const rows: GridRowData[] = [
  { id: 'r1', cells: { name: 'Alpha', count: 1 } },
  { id: 'r2', cells: { name: 'Beta', count: 2 } }
]

function cell(row: number, col: number): HTMLElement {
  return document.querySelector(`[data-row-index="${row}"][data-col-index="${col}"]`) as HTMLElement
}

function gridEl(): HTMLElement {
  return document.querySelector('[data-xnet-grid]') as HTMLElement
}

describe('ghost row', () => {
  it('renders one extra empty row when onAddRowWithCells is provided', () => {
    render(<GridSurface fields={fields} rows={rows} onAddRowWithCells={vi.fn()} />)
    expect(cell(2, 0)).toBeTruthy()
    expect(cell(2, 0).getAttribute('data-row-id')).toBe('__ghost__')
    expect(cell(3, 0)).toBeNull()
  })

  it('typing in a ghost-row cell creates a row with that value', () => {
    const onAddRowWithCells = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onAddRowWithCells={onAddRowWithCells} />)

    fireEvent.mouseDown(cell(2, 0))
    fireEvent.keyDown(gridEl(), { key: 'N' })
    const input = cell(2, 0).querySelector('input, textarea') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New row' } })
    fireEvent.keyDown(gridEl(), { key: 'Enter' })

    expect(onAddRowWithCells).toHaveBeenCalledWith({ name: 'New row' })
  })

  it('committing an empty ghost cell creates nothing', () => {
    const onAddRowWithCells = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onAddRowWithCells={onAddRowWithCells} />)
    fireEvent.mouseDown(cell(2, 0))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(onAddRowWithCells).not.toHaveBeenCalled()
  })

  it('arrow navigation reaches the ghost row', () => {
    render(<GridSurface fields={fields} rows={rows} onAddRowWithCells={vi.fn()} />)
    fireEvent.mouseDown(cell(1, 0))
    fireEvent.keyDown(gridEl(), { key: 'ArrowDown' })
    expect(cell(2, 0).className).toContain('ring-2')
  })

  it('no ghost row in readOnly mode', () => {
    render(<GridSurface fields={fields} rows={rows} readOnly onAddRowWithCells={vi.fn()} />)
    expect(cell(2, 0)).toBeNull()
  })
})

describe('ghost column', () => {
  it('renders one extra empty column when onAddFieldWithCell is provided', () => {
    render(<GridSurface fields={fields} rows={rows} onAddFieldWithCell={vi.fn()} />)
    expect(cell(0, 2)).toBeTruthy()
    expect(cell(0, 2).getAttribute('data-field-id')).toBe('__ghost__')
  })

  it('typing in a ghost-column cell creates a field with that value on the row', () => {
    const onAddFieldWithCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onAddFieldWithCell={onAddFieldWithCell} />)

    fireEvent.mouseDown(cell(0, 2))
    fireEvent.keyDown(gridEl(), { key: 'h' })
    const input = cell(0, 2).querySelector('input, textarea') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(gridEl(), { key: 'Enter' })

    expect(onAddFieldWithCell).toHaveBeenCalledWith('r1', 'hello')
  })

  it('ghost corner (ghost row × ghost column) is inert', () => {
    const onAddRowWithCells = vi.fn()
    const onAddFieldWithCell = vi.fn()
    render(
      <GridSurface
        fields={fields}
        rows={rows}
        onAddRowWithCells={onAddRowWithCells}
        onAddFieldWithCell={onAddFieldWithCell}
      />
    )
    // The corner renders as an inert div, not a cell
    expect(cell(2, 2)).toBeNull()
    expect(screen.queryAllByRole('gridcell').length).toBeGreaterThan(0)
  })
})
