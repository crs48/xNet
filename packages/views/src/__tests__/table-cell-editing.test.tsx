import type { ColumnMeta, FilterOperator } from '../types'
import type { Cell } from '@tanstack/react-table'
import type { PropertyDefinition, PropertyType } from '@xnet/data'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TableCell } from '../table/TableCell'

type TableRow = { id: string; [key: string]: unknown }

function createMockCell(
  rowId: string,
  columnId: string,
  value: unknown,
  meta: ColumnMeta
): Cell<TableRow, unknown> {
  return {
    getValue: () => value,
    row: { original: { id: rowId } },
    column: {
      id: columnId,
      getSize: () => 160,
      columnDef: { meta }
    }
  } as unknown as Cell<TableRow, unknown>
}

const property: PropertyDefinition = {
  '@id': 'xnet://xnet.fyi/Test#title',
  name: 'Title',
  type: 'text',
  required: false,
  config: {}
}

const testHandler = {
  type: 'text' as PropertyType,
  filterOperators: ['contains'] as FilterOperator[],
  applyFilter: () => true,
  compare: () => 0,
  render: (value: unknown) => String(value ?? ''),
  Editor: ({ value, onChange }: { value: unknown; onChange: (next: string) => void }) => (
    <input
      aria-label="cell-input"
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

describe('TableCell editing flow', () => {
  it('commits text edits on Enter (not on each change)', () => {
    const onUpdate = vi.fn()
    const meta: ColumnMeta = {
      property,
      handler: testHandler,
      onUpdate
    }
    const cell = createMockCell('row-1', 'title', 'Initial', meta)

    render(
      <table>
        <tbody>
          <tr>
            <TableCell cell={cell} />
          </tr>
        </tbody>
      </table>
    )

    const td = document.querySelector('td[data-row-id="row-1"][data-column-id="title"]')
    expect(td).toBeTruthy()

    fireEvent.click(td!)
    const input = screen.getByLabelText('cell-input')
    fireEvent.change(input, { target: { value: 'Updated title' } })

    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.keyDown(td!, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('row-1', 'Updated title')
  })

  it('moves focus with arrow keys in view mode', () => {
    const onUpdate = vi.fn()
    const left = createMockCell('row-1', 'left', 'A', {
      property,
      handler: testHandler,
      onUpdate
    })
    const right = createMockCell('row-1', 'right', 'B', {
      property: { ...property, '@id': 'xnet://xnet.fyi/Test#right', name: 'Right' },
      handler: testHandler,
      onUpdate
    })

    render(
      <table>
        <tbody>
          <tr>
            <TableCell cell={left} />
            <TableCell cell={right} />
          </tr>
        </tbody>
      </table>
    )

    const leftCell = document.querySelector('td[data-column-id="left"]') as HTMLTableCellElement
    const rightCell = document.querySelector('td[data-column-id="right"]') as HTMLTableCellElement
    leftCell.focus()
    fireEvent.keyDown(leftCell, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(rightCell)
  })

  it('commits on Tab and moves focus without trapping', () => {
    const onUpdate = vi.fn()
    const left = createMockCell('row-1', 'left', 'A', {
      property,
      handler: testHandler,
      onUpdate
    })
    const right = createMockCell('row-1', 'right', 'B', {
      property: { ...property, '@id': 'xnet://xnet.fyi/Test#right', name: 'Right' },
      handler: testHandler,
      onUpdate
    })

    render(
      <table>
        <tbody>
          <tr>
            <TableCell cell={left} />
            <TableCell cell={right} />
          </tr>
        </tbody>
      </table>
    )

    const leftCell = document.querySelector('td[data-column-id="left"]') as HTMLTableCellElement
    const rightCell = document.querySelector('td[data-column-id="right"]') as HTMLTableCellElement

    fireEvent.click(leftCell)
    const input = screen.getByLabelText('cell-input')
    fireEvent.change(input, { target: { value: 'Tabbed value' } })

    fireEvent.keyDown(leftCell, { key: 'Tab' })

    expect(onUpdate).toHaveBeenCalledWith('row-1', 'Tabbed value')
    expect(document.activeElement).toBe(rightCell)
  })
})
