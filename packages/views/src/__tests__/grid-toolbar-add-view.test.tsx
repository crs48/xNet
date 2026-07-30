/**
 * Tests for the GridToolbar add-view type picker (exploration 0278).
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GridToolbar } from '../grid/GridToolbar.js'

const views = [{ id: 'v1', name: 'Table', type: 'table' as const }]

describe('GridToolbar add-view', () => {
  it('opens a type picker and reports the chosen type', () => {
    const onAddViewOfType = vi.fn()
    render(
      <GridToolbar
        views={views}
        fields={[]}
        addViewTypes={[
          { type: 'table', label: 'Table' },
          { type: 'form', label: 'Form' }
        ]}
        onAddViewOfType={onAddViewOfType}
      />
    )
    fireEvent.click(screen.getByLabelText('Add view'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Form' }))
    expect(onAddViewOfType).toHaveBeenCalledWith('form')
    // Menu closes after picking.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('falls back to direct add without a type list', () => {
    const onAddView = vi.fn()
    render(<GridToolbar views={views} fields={[]} onAddView={onAddView} />)
    fireEvent.click(screen.getByLabelText('Add view'))
    expect(onAddView).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('hides the button entirely when no add handler is provided', () => {
    render(<GridToolbar views={views} fields={[]} />)
    expect(screen.queryByLabelText('Add view')).toBeNull()
  })
})
