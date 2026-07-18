/**
 * Grid performance budgets (exploration 0159 validation):
 * - 10k-row dataset renders a bounded DOM (virtualization, not 10k rows)
 * - initial render and cursor movement stay within time budgets
 * - the state machine sustains bulk operations cheaply
 */

import type { GridField, GridRowData } from './model'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GridSurface } from './GridSurface'
import { createGridState, gridReducer } from './state'

function budget(localMs: number, ciMs: number): number {
  return process.env.CI ? ciMs : localMs
}

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
  { id: 'title', name: 'Title', type: 'text', config: {}, width: 240, isTitle: true },
  { id: 'count', name: 'Count', type: 'number', config: {}, width: 100 },
  { id: 'note', name: 'Note', type: 'text', config: {}, width: 200 }
]

function makeRows(n: number): GridRowData[] {
  const rows: GridRowData[] = []
  for (let i = 0; i < n; i++) {
    rows.push({ id: `r${i}`, cells: { title: `Row ${i}`, count: i, note: `note ${i}` } })
  }
  return rows
}

describe('grid performance budgets', () => {
  it('renders 10k rows with a bounded DOM and within budget', () => {
    const rows = makeRows(10_000)

    const start = performance.now()
    render(<GridSurface fields={fields} rows={rows} />)
    const elapsed = performance.now() - start

    // Virtualization: only the visible window (+overscan) is in the DOM
    const renderedRows = document.querySelectorAll('[data-grid-body] [role="row"]').length
    expect(renderedRows).toBeGreaterThan(0)
    expect(renderedRows).toBeLessThan(100)

    expect(elapsed).toBeLessThan(budget(1500, 4000))
  })

  it('cursor movement over a 10k-row grid stays within budget', () => {
    const rows = makeRows(10_000)
    render(<GridSurface fields={fields} rows={rows} />)

    const cell = document.querySelector('[data-row-index="0"][data-col-index="0"]') as HTMLElement
    fireEvent.mouseDown(cell)
    const grid = document.querySelector('[data-xnet-grid]') as HTMLElement

    const start = performance.now()
    for (let i = 0; i < 30; i++) {
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
    }
    const elapsed = performance.now() - start

    // ~30 cursor moves with virtualized re-renders
    expect(elapsed).toBeLessThan(budget(1500, 4000))
  })

  it('renders a 128-column table with bounded cells per row (column virtualization, 0340)', () => {
    const wideFields: GridField[] = Array.from({ length: 128 }, (_, i) => ({
      id: `f${i}`,
      name: `Col ${i}`,
      type: 'text' as const,
      config: {},
      width: 150,
      ...(i === 0 ? { isTitle: true } : {})
    }))
    const rows: GridRowData[] = Array.from({ length: 1000 }, (_, r) => ({
      id: `r${r}`,
      cells: Object.fromEntries(wideFields.map((f, c) => [f.id, `r${r}c${c}`]))
    }))

    const start = performance.now()
    render(<GridSurface fields={wideFields} rows={rows} />)
    const elapsed = performance.now() - start

    // Column virtualization: only the visible window (+overscan 3) of the
    // 128 columns renders per row — the measured fps killer was mounting
    // all columns per overscan row (0340: 8.6fps at 128 cols unvirtualized).
    const firstRow = document.querySelector('[data-grid-body] [role="row"]') as HTMLElement
    const renderedCells = firstRow.querySelectorAll('[data-grid-cell]').length
    expect(renderedCells).toBeGreaterThan(0)
    expect(renderedCells).toBeLessThan(32)

    expect(elapsed).toBeLessThan(budget(1500, 4000))
  })

  it('the state machine sustains 100k reducer operations cheaply', () => {
    let state = createGridState(10_000, 20)
    state = gridReducer(state, { type: 'focusCell', pos: { row: 0, col: 0 } })

    const start = performance.now()
    for (let i = 0; i < 100_000; i++) {
      state = gridReducer(state, { type: 'move', dir: i % 2 === 0 ? 'down' : 'right' })
    }
    const elapsed = performance.now() - start

    expect(state.cursor).not.toBeNull()
    expect(elapsed).toBeLessThan(budget(500, 2000))
  })
})
