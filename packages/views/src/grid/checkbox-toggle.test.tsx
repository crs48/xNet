/**
 * Checkbox cells toggle in place — no edit session (Sheets/Notion
 * behavior). Previously the editor's own checkbox click bubbled to the
 * cell, re-entered grid selection, and tore the session down before the
 * toggle landed.
 */

import type { GridField, GridRowData } from './model'
import { render, fireEvent } from '@testing-library/react'
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
  { id: 'done', name: 'Done', type: 'checkbox', config: {}, width: 90 }
]

const rows: GridRowData[] = [
  { id: 'r1', cells: { name: 'Alpha', done: false } },
  { id: 'r2', cells: { name: 'Beta', done: true } }
]

function cell(row: number, col: number): HTMLElement {
  return document.querySelector(`[data-row-index="${row}"][data-col-index="${col}"]`) as HTMLElement
}

function gridEl(): HTMLElement {
  return document.querySelector('[data-xnet-grid]') as HTMLElement
}

describe('checkbox toggle-in-place', () => {
  it('double-click toggles the value without opening an editor', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.doubleClick(cell(0, 1))
    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'done', true)
    // No editor mounted
    expect(cell(0, 1).querySelector('input')).toBeNull()
  })

  it('double-click on a checked cell unchecks it', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.doubleClick(cell(1, 1))
    expect(onUpdateCell).toHaveBeenCalledWith('r2', 'done', false)
  })

  it('Enter on a focused checkbox cell toggles it', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    fireEvent.mouseDown(cell(0, 1))
    fireEvent.keyDown(gridEl(), { key: 'Enter' })
    expect(onUpdateCell).toHaveBeenCalledWith('r1', 'done', true)
    expect(cell(0, 1).querySelector('input')).toBeNull()
  })

  it('readOnly grids do not toggle', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} readOnly onUpdateCell={onUpdateCell} />)
    fireEvent.doubleClick(cell(0, 1))
    expect(onUpdateCell).not.toHaveBeenCalled()
  })

  it('clicks inside an open text editor do not tear down the session', () => {
    const onUpdateCell = vi.fn()
    render(<GridSurface fields={fields} rows={rows} onUpdateCell={onUpdateCell} />)

    // Open the text editor on Name
    fireEvent.doubleClick(cell(0, 0))
    const input = cell(0, 0).querySelector('input, textarea') as HTMLInputElement
    expect(input).toBeTruthy()

    // Mousedown inside the editor (e.g. positioning the caret) must keep
    // the session alive
    fireEvent.mouseDown(input)
    expect(cell(0, 0).querySelector('input, textarea')).toBeTruthy()
  })
})
