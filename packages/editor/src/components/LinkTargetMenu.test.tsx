import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LinkTargetMenu, wikilinkKindIcon, type LinkTargetMenuRef } from './LinkTargetMenu'

const ITEMS = [
  { id: 'page-1', label: 'Launch Plan', kind: 'page', subtitle: 'page' },
  { id: 'xnet://database/db-1', label: 'Tracker', kind: 'database', subtitle: 'database' }
]

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true })
}

function pressKey(ref: React.RefObject<LinkTargetMenuRef | null>, key: string): boolean {
  let handled = false
  act(() => {
    handled = ref.current?.onKeyDown(keyEvent(key)) ?? false
  })
  return handled
}

describe('LinkTargetMenu', () => {
  it('renders an empty state when there are no items', () => {
    render(<LinkTargetMenu items={[]} command={vi.fn()} />)
    expect(screen.getByTestId('link-target-menu-empty')).toBeInTheDocument()
  })

  it('renders items with labels and kind subtitles', () => {
    render(<LinkTargetMenu items={ITEMS} command={vi.fn()} />)
    expect(screen.getByText('Launch Plan')).toBeInTheDocument()
    expect(screen.getByText('database')).toBeInTheDocument()
  })

  it('commits the highlighted item on Enter and supports arrow navigation', () => {
    const command = vi.fn()
    const ref = createRef<LinkTargetMenuRef>()
    render(<LinkTargetMenu ref={ref} items={ITEMS} command={command} />)

    expect(pressKey(ref, 'ArrowDown')).toBe(true)
    expect(pressKey(ref, 'Enter')).toBe(true)
    expect(command).toHaveBeenCalledWith(ITEMS[1])
  })

  it('commits on Tab as well', () => {
    const command = vi.fn()
    const ref = createRef<LinkTargetMenuRef>()
    render(<LinkTargetMenu ref={ref} items={ITEMS} command={command} />)

    expect(pressKey(ref, 'Tab')).toBe(true)
    expect(command).toHaveBeenCalledWith(ITEMS[0])
  })

  it('ignores keys when empty and unrelated keys when populated', () => {
    const ref = createRef<LinkTargetMenuRef>()
    const { rerender } = render(<LinkTargetMenu ref={ref} items={[]} command={vi.fn()} />)
    expect(pressKey(ref, 'Enter')).toBe(false)

    rerender(<LinkTargetMenu ref={ref} items={ITEMS} command={vi.fn()} />)
    expect(pressKey(ref, 'a')).toBe(false)
  })

  it('maps unknown kinds to the generic link icon', () => {
    expect(wikilinkKindIcon('page')).not.toBe(wikilinkKindIcon('mystery'))
    expect(wikilinkKindIcon('mystery')).toBe(wikilinkKindIcon('other'))
  })
})
