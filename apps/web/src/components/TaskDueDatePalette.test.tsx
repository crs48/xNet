import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskDueDatePalette } from './TaskDueDatePalette'

function paletteInput(): HTMLInputElement {
  return screen.getByTestId('task-due-palette').querySelector('input') as HTMLInputElement
}

describe('TaskDueDatePalette', () => {
  it('commits a typed natural-language date and closes', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TaskDueDatePalette onSelect={onSelect} onClose={onClose} />)

    fireEvent.change(paletteInput(), { target: { value: '2026-07-01' } })
    expect(screen.getByText(/Set due/)).toBeTruthy()
    fireEvent.keyDown(paletteInput(), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(Date.UTC(2026, 6, 1))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears the due date via the preset', () => {
    const onSelect = vi.fn()
    render(<TaskDueDatePalette onSelect={onSelect} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Clear due date'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('navigates presets with arrow keys and commits on Enter', () => {
    const onSelect = vi.fn()
    render(<TaskDueDatePalette onSelect={onSelect} onClose={() => {}} />)

    // Default list starts at "Today"; ArrowDown→Tomorrow, ArrowUp→Today.
    fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' })
    fireEvent.keyDown(paletteInput(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(typeof onSelect.mock.calls[0][0]).toBe('number')
  })

  it('closes on Escape and backdrop click without selecting', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<TaskDueDatePalette onSelect={onSelect} onClose={onClose} />)

    fireEvent.keyDown(paletteInput(), { key: 'Escape' })
    fireEvent.click(screen.getByTestId('task-due-palette'))
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('filters presets by the typed query when it is not a date', () => {
    render(<TaskDueDatePalette onSelect={() => {}} onClose={() => {}} />)

    fireEvent.change(paletteInput(), { target: { value: 'week' } })
    expect(screen.getByText('Next week')).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
  })
})
