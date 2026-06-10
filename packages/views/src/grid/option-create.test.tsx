/**
 * Typeahead option creation — select/multiSelect editors persist new
 * options through config.onCreateOption (V2 SelectOption nodes) and
 * write the returned node ID into the cell value.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { multiSelectHandler } from '../properties/multiSelect'
import { optionChipStyle } from '../properties/optionColors'
import { selectHandler } from '../properties/select'

const options = [
  { id: 'o1', name: 'Todo', color: 'gray' },
  { id: 'o2', name: 'Done', color: 'green' }
]

describe('select editor — typeahead create', () => {
  it('filters options as you type and picks via Enter', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <selectHandler.Editor
        value={null}
        config={{ options }}
        onChange={onChange}
        onCommit={onCommit}
        autoFocus
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'do' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // 'Todo' and 'Done' both match; first is picked
    expect(onChange).toHaveBeenCalledWith('o1')
    expect(onCommit).toHaveBeenCalledWith('o1', 'picker-select')
  })

  it('creates an unknown option through onCreateOption and commits its ID', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const onCreateOption = vi.fn().mockResolvedValue('o-new')
    render(
      <selectHandler.Editor
        value={null}
        config={{ options, onCreateOption }}
        onChange={onChange}
        onCommit={onCommit}
        autoFocus
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Urgent' } })
    expect(screen.getByText('＋ Create "Urgent"')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onCreateOption).toHaveBeenCalledWith('Urgent'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('o-new'))
    expect(onCommit).toHaveBeenCalledWith('o-new', 'picker-select')
  })

  it('does not offer create for existing names', () => {
    render(<selectHandler.Editor value={null} config={{ options }} onChange={vi.fn()} autoFocus />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'done' } })
    expect(screen.queryByText(/Create/)).toBeNull()
  })

  it('renders named colors via the chip palette', () => {
    const { container } = render(<>{selectHandler.render('o2', { options })}</>)
    const chip = container.querySelector('span') as HTMLElement
    expect(chip.textContent).toBe('Done')
    expect(chip.style.backgroundColor).not.toBe('')
  })
})

describe('multiSelect editor — typeahead create', () => {
  it('creates through onCreateOption and appends the node ID', async () => {
    const onChange = vi.fn()
    const onCreateOption = vi.fn().mockResolvedValue('o-created')
    render(
      <multiSelectHandler.Editor
        value={['o1']}
        config={{ options, onCreateOption }}
        onChange={onChange}
        autoFocus
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'NewTag' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onCreateOption).toHaveBeenCalledWith('NewTag'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['o1', 'o-created']))
  })

  it('Backspace removes the last chip', () => {
    const onChange = vi.fn()
    render(
      <multiSelectHandler.Editor
        value={['o1', 'o2']}
        config={{ options }}
        onChange={onChange}
        autoFocus
      />
    )
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith(['o1'])
  })
})

describe('optionChipStyle', () => {
  it('maps named colors to the soft palette', () => {
    expect(optionChipStyle('red').color).not.toBe('#ffffff')
    expect(optionChipStyle('green').backgroundColor).toBeTruthy()
  })

  it('passes legacy hex colors through with white text', () => {
    expect(optionChipStyle('#123456')).toEqual({ backgroundColor: '#123456', color: '#ffffff' })
  })

  it('falls back to gray for missing colors', () => {
    expect(optionChipStyle(undefined)).toEqual(optionChipStyle('gray'))
  })
})
