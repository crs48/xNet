import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SlashMenu, type SlashMenuRef } from './SlashMenu'

function createItem(title: string) {
  return {
    title,
    description: `${title} description`,
    icon: title[0] ?? 'x',
    command: vi.fn()
  }
}

describe('SlashMenu', () => {
  it('renders empty state when there are no items', () => {
    render(<SlashMenu items={[]} command={vi.fn()} />)
    expect(screen.getByTestId('slash-menu-empty')).toBeInTheDocument()
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('navigates deterministically with arrow keys and enter', () => {
    const command = vi.fn()
    const items = [createItem('Heading 1'), createItem('Code Block'), createItem('Quote')]
    const ref = { current: null as SlashMenuRef | null }

    render(<SlashMenu ref={ref} items={items} command={command} />)

    expect(screen.getByTestId('slash-menu')).toBeInTheDocument()

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown' })
    const enter = new KeyboardEvent('keydown', { key: 'Enter' })
    const escape = new KeyboardEvent('keydown', { key: 'Escape' })

    act(() => {
      expect(ref.current?.onKeyDown(down)).toBe(true)
    })
    act(() => {
      expect(ref.current?.onKeyDown(enter)).toBe(true)
    })
    expect(command).toHaveBeenCalledTimes(1)
    expect(command).toHaveBeenCalledWith(items[1])

    expect(ref.current?.onKeyDown(escape)).toBe(false)
  })

  it('resets selection index when menu items change', () => {
    const command = vi.fn()
    const initialItems = [createItem('One'), createItem('Two')]
    const ref = { current: null as SlashMenuRef | null }

    const { rerender } = render(<SlashMenu ref={ref} items={initialItems} command={command} />)
    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })

    const nextItems = [createItem('Three'), createItem('Four')]
    rerender(<SlashMenu ref={ref} items={nextItems} command={command} />)

    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(command).toHaveBeenCalledWith(nextItems[0])
  })

  it('supports click selection', () => {
    const command = vi.fn()
    const items = [createItem('Paragraph')]
    render(<SlashMenu items={items} command={command} />)

    fireEvent.click(screen.getByRole('button', { name: /Paragraph/i }))
    expect(command).toHaveBeenCalledWith(items[0])
  })
})
