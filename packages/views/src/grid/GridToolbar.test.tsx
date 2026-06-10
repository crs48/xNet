/**
 * GridToolbar tests — view tabs, sort chips, filter adapters,
 * visibility popover, group selector, quick-find.
 */

import type { GridField } from './model'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { GridToolbar, toSurfaceFilter, fromSurfaceFilter } from './GridToolbar'

const fields: GridField[] = [
  { id: 'name', name: 'Name', type: 'text', config: {}, width: 200 },
  { id: 'status', name: 'Status', type: 'select', config: {}, width: 140 }
]

const views = [
  { id: 'v1', name: 'Table', type: 'table' as const },
  { id: 'v2', name: 'Board', type: 'board' as const }
]

describe('GridToolbar', () => {
  it('renders view tabs and selects them', () => {
    const onSelectView = vi.fn()
    render(
      <GridToolbar views={views} activeViewId="v1" onSelectView={onSelectView} fields={fields} />
    )
    expect(screen.getByRole('tab', { name: 'Table' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Board' }))
    expect(onSelectView).toHaveBeenCalledWith('v2')
  })

  it('adds a view', () => {
    const onAddView = vi.fn()
    render(<GridToolbar views={views} fields={fields} onAddView={onAddView} />)
    fireEvent.click(screen.getByLabelText('Add view'))
    expect(onAddView).toHaveBeenCalled()
  })

  it('shows sort chips and toggles/clears them', () => {
    const onToggleSort = vi.fn()
    const onClearSorts = vi.fn()
    render(
      <GridToolbar
        views={views}
        fields={fields}
        sorts={[{ columnId: 'status', direction: 'asc' }]}
        onToggleSort={onToggleSort}
        onClearSorts={onClearSorts}
      />
    )
    fireEvent.click(screen.getByText('Status'))
    expect(onToggleSort).toHaveBeenCalledWith('status')
    fireEvent.click(screen.getByLabelText('Clear sort on Status'))
    expect(onClearSorts).toHaveBeenCalled()
  })

  it('opens the field visibility popover and toggles a field', () => {
    const onToggleFieldVisible = vi.fn()
    render(
      <GridToolbar
        views={views}
        fields={fields}
        hiddenFieldIds={['status']}
        onToggleFieldVisible={onToggleFieldVisible}
      />
    )
    fireEvent.click(screen.getByLabelText('Fields'))
    fireEvent.click(screen.getByLabelText('Show Status'))
    expect(onToggleFieldVisible).toHaveBeenCalledWith('status', false)

    fireEvent.click(screen.getByLabelText('Hide Name'))
    expect(onToggleFieldVisible).toHaveBeenCalledWith('name', true)
  })

  it('group popover lists groupable fields and clears grouping', () => {
    const onChangeGroupBy = vi.fn()
    render(
      <GridToolbar
        views={views}
        fields={fields}
        groupBy="status"
        onChangeGroupBy={onChangeGroupBy}
      />
    )
    fireEvent.click(screen.getByLabelText('Group'))
    fireEvent.click(screen.getByText('None'))
    expect(onChangeGroupBy).toHaveBeenCalledWith(null)
  })

  it('quick-find emits changes and clears on Escape', () => {
    const onSearchChange = vi.fn()
    render(
      <GridToolbar views={views} fields={fields} search="abc" onSearchChange={onSearchChange} />
    )
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'abcd' } })
    expect(onSearchChange).toHaveBeenCalledWith('abcd')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(onSearchChange).toHaveBeenCalledWith('')
  })

  it('filter button reflects active filter count', () => {
    render(
      <GridToolbar
        views={views}
        fields={fields}
        filters={{
          operator: 'and',
          conditions: [
            { columnId: 'status', operator: 'equals', value: 'x' },
            { columnId: 'name', operator: 'contains', value: 'y' }
          ]
        }}
        onChangeFilters={vi.fn()}
      />
    )
    expect(screen.getByText('2 filters')).toBeTruthy()
  })
})

describe('filter dialect adapters', () => {
  it('round-trips a flat filter group', () => {
    const data = {
      operator: 'and' as const,
      conditions: [{ columnId: 'status', operator: 'equals' as const, value: 'done' }]
    }
    const surface = toSurfaceFilter(data)
    expect(surface).toEqual({
      type: 'and',
      filters: [{ id: 'status:equals', propertyId: 'status', operator: 'equals', value: 'done' }]
    })
    expect(fromSurfaceFilter(surface)).toEqual(data)
  })

  it('maps empty groups to null', () => {
    expect(toSurfaceFilter(null)).toBeNull()
    expect(fromSurfaceFilter({ type: 'and', filters: [] })).toBeNull()
  })
})
