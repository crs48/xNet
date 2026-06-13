import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useListboxNavigation, type ListboxKeyEvent } from './useListboxNavigation'

function keyEvent(key: string, extra: Partial<ListboxKeyEvent> = {}): ListboxKeyEvent {
  return { key, preventDefault: vi.fn(), ...extra }
}

describe('useListboxNavigation', () => {
  it('wraps with arrow keys and commits the highlighted index on Enter', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useListboxNavigation({ count: 3, onCommit }))

    act(() => void result.current.onKeyDown(keyEvent('ArrowDown')))
    expect(result.current.activeIndex).toBe(1)

    act(() => void result.current.onKeyDown(keyEvent('Enter')))
    expect(onCommit).toHaveBeenCalledWith(1)

    // ArrowUp from 1 → 0 → wrap to last (2)
    act(() => void result.current.onKeyDown(keyEvent('ArrowUp')))
    act(() => void result.current.onKeyDown(keyEvent('ArrowUp')))
    expect(result.current.activeIndex).toBe(2)
  })

  it('commits on Tab as well', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useListboxNavigation({ count: 2, onCommit }))
    act(() => void result.current.onKeyDown(keyEvent('Tab')))
    expect(onCommit).toHaveBeenCalledWith(0)
  })

  it('does not commit while an IME composition is active', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useListboxNavigation({ count: 2, onCommit }))

    let handled = true
    act(() => {
      handled = result.current.onKeyDown(keyEvent('Enter', { isComposing: true }))
    })
    expect(handled).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()

    // React-style event: isComposing lives on nativeEvent
    act(() => {
      handled = result.current.onKeyDown(keyEvent('Enter', { nativeEvent: { isComposing: true } }))
    })
    expect(handled).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('clamps instead of wrapping when wrap is false', () => {
    const { result } = renderHook(() =>
      useListboxNavigation({ count: 2, onCommit: vi.fn(), wrap: false })
    )
    act(() => void result.current.onKeyDown(keyEvent('ArrowUp')))
    expect(result.current.activeIndex).toBe(0)
    act(() => void result.current.onKeyDown(keyEvent('ArrowDown')))
    act(() => void result.current.onKeyDown(keyEvent('ArrowDown')))
    expect(result.current.activeIndex).toBe(1)
  })

  it('calls onDismiss on Escape only when provided', () => {
    const onDismiss = vi.fn()
    const withDismiss = renderHook(() =>
      useListboxNavigation({ count: 2, onCommit: vi.fn(), onDismiss })
    )
    let handled = false
    act(() => {
      handled = withDismiss.result.current.onKeyDown(keyEvent('Escape'))
    })
    expect(handled).toBe(true)
    expect(onDismiss).toHaveBeenCalled()

    const noDismiss = renderHook(() => useListboxNavigation({ count: 2, onCommit: vi.fn() }))
    act(() => {
      handled = noDismiss.result.current.onKeyDown(keyEvent('Escape'))
    })
    expect(handled).toBe(false)
  })

  it('swallows nav/commit keys when empty only if asked', () => {
    const swallow = renderHook(() =>
      useListboxNavigation({ count: 0, onCommit: vi.fn(), swallowKeysWhenEmpty: true })
    )
    expect(swallow.result.current.onKeyDown(keyEvent('ArrowDown'))).toBe(true)
    expect(swallow.result.current.onKeyDown(keyEvent('Enter'))).toBe(true)

    const passthrough = renderHook(() => useListboxNavigation({ count: 0, onCommit: vi.fn() }))
    expect(passthrough.result.current.onKeyDown(keyEvent('Enter'))).toBe(false)
  })

  it('resets the highlight when the resetKey changes identity', () => {
    const first = ['a', 'b']
    const { result, rerender } = renderHook(
      ({ items }) =>
        useListboxNavigation({ count: items.length, onCommit: vi.fn(), resetKey: items }),
      { initialProps: { items: first } }
    )
    act(() => void result.current.onKeyDown(keyEvent('ArrowDown')))
    expect(result.current.activeIndex).toBe(1)

    rerender({ items: ['c', 'd'] }) // same length, new identity
    expect(result.current.activeIndex).toBe(0)
  })

  it('exposes aria-activedescendant ids only when idPrefix is set', () => {
    const withId = renderHook(() =>
      useListboxNavigation({ count: 2, onCommit: vi.fn(), idPrefix: 'chat' })
    )
    expect(withId.result.current.optionId(1)).toBe('chat-opt-1')
    expect(withId.result.current.activeDescendantId).toBe('chat-opt-0')

    const withoutId = renderHook(() => useListboxNavigation({ count: 2, onCommit: vi.fn() }))
    expect(withoutId.result.current.optionId(1)).toBeUndefined()
    expect(withoutId.result.current.activeDescendantId).toBeUndefined()
  })

  it('is a no-op when closed', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useListboxNavigation({ count: 2, onCommit, isOpen: false }))
    expect(result.current.onKeyDown(keyEvent('Enter'))).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })
})
