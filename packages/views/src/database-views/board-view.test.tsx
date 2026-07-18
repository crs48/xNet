/**
 * BoardView render tests (exploration 0337): stacks from option order,
 * null stack, open-on-click, add-card prefill, and the window-honesty
 * footnote.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GridField } from '../grid/model.js'
import { BoardView } from './BoardView.js'
import { EMPTY_VIEW_CONFIG, type DatabaseViewProps, type DatabaseViewRow } from './contract.js'

const fields: GridField[] = [
  { id: 'f-title', name: 'Task', type: 'text', config: {}, width: 200, isTitle: true },
  {
    id: 'f-status',
    name: 'Status',
    type: 'select',
    config: {},
    width: 120,
    options: [
      { id: 'opt-todo', name: 'To Do', color: 'gray' },
      { id: 'opt-doing', name: 'In Progress', color: 'blue' }
    ]
  }
]

const rows: DatabaseViewRow[] = [
  { id: 'r1', sortKey: 'a1', cells: { 'f-title': 'Ship it', 'f-status': 'opt-todo' } },
  { id: 'r2', sortKey: 'a2', cells: { 'f-title': 'Review it', 'f-status': 'opt-doing' } },
  { id: 'r3', sortKey: 'a3', cells: { 'f-title': 'Orphan' } }
]

function boardProps(overrides: Partial<DatabaseViewProps> = {}): DatabaseViewProps {
  return {
    fields,
    visibleFields: fields,
    rows,
    window: { size: 500, total: null },
    config: { ...EMPTY_VIEW_CONFIG, groupBy: 'f-status' },
    ...overrides
  }
}

describe('BoardView', () => {
  it('renders stacks in option order with a null stack for empty cells', () => {
    render(<BoardView {...boardProps()} />)
    const columns = screen.getAllByTestId('board-column')
    const keys = columns.map((c) => c.getAttribute('data-group-key'))
    expect(keys).toEqual(['__none__', 'opt-todo', 'opt-doing'])
    expect(screen.getByText('No Status')).toBeTruthy()
    expect(screen.getByText('Ship it')).toBeTruthy()
  })

  it('opens a row on card click', () => {
    const onOpenRow = vi.fn()
    render(<BoardView {...boardProps({ onOpenRow })} />)
    fireEvent.click(screen.getByText('Ship it'))
    expect(onOpenRow).toHaveBeenCalledWith('r1')
  })

  it('pre-fills the group value when adding a card to a stack', () => {
    const onCreateRow = vi.fn()
    render(<BoardView {...boardProps({ onCreateRow })} />)
    fireEvent.click(screen.getByLabelText('Add card to In Progress'))
    expect(onCreateRow).toHaveBeenCalledWith({ 'f-status': 'opt-doing' })
  })

  it('falls back to the first select field when groupBy is unset', () => {
    render(<BoardView {...boardProps({ config: { ...EMPTY_VIEW_CONFIG } })} />)
    expect(screen.getAllByTestId('board-column').length).toBeGreaterThan(1)
  })

  it('shows the window footnote when the fetch window truncates', () => {
    render(<BoardView {...boardProps({ window: { size: 500, total: 12400 } })} />)
    expect(screen.getByTestId('window-footnote').textContent).toContain('12400')
  })

  it('asks for a select field when none exists', () => {
    const bare = fields.filter((f) => f.type !== 'select')
    render(
      <BoardView
        {...boardProps({ fields: bare, visibleFields: bare, config: { ...EMPTY_VIEW_CONFIG } })}
      />
    )
    expect(screen.getByText(/Add a select field/)).toBeTruthy()
  })
})
