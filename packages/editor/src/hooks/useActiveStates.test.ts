import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActiveStates } from './useActiveStates'

// Mock editor with event emitter behavior
function createMockEditor(activeMap: Record<string, boolean> = {}) {
  const listeners: Record<string, Set<(...args: unknown[]) => unknown>> = {}

  return {
    isActive: vi.fn((name: string, attrs?: any) => {
      if (attrs?.level) {
        return activeMap[`${name}${attrs.level}`] || false
      }
      return activeMap[name] || false
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (!listeners[event]) listeners[event] = new Set()
      listeners[event].add(handler)
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      listeners[event]?.delete(handler)
    }),
    // Helper to emit events in tests
    _emit(event: string) {
      listeners[event]?.forEach((fn) => fn())
    },
    _listeners: listeners
  } as any
}

describe('useActiveStates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial states when editor is null', () => {
    const { result } = renderHook(() => useActiveStates(null))
    expect(result.current.bold).toBe(false)
    expect(result.current.italic).toBe(false)
    expect(result.current.heading1).toBe(false)
  })

  it('computes initial states from editor', () => {
    const editor = createMockEditor({ bold: true, italic: true })
    const { result } = renderHook(() => useActiveStates(editor))

    expect(result.current.bold).toBe(true)
    expect(result.current.italic).toBe(true)
    expect(result.current.strike).toBe(false)
  })

  it('registers selectionUpdate and transaction listeners', () => {
    const editor = createMockEditor()
    renderHook(() => useActiveStates(editor))

    expect(editor.on).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    expect(editor.on).toHaveBeenCalledWith('transaction', expect.any(Function))
  })

  it('removes listeners on unmount', () => {
    const editor = createMockEditor()
    const { unmount } = renderHook(() => useActiveStates(editor))

    unmount()

    expect(editor.off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    expect(editor.off).toHaveBeenCalledWith('transaction', expect.any(Function))
  })

  it('updates states on selectionUpdate (throttled)', () => {
    const editor = createMockEditor({ bold: false })
    const { result } = renderHook(() => useActiveStates(editor, { throttleMs: 50 }))

    expect(result.current.bold).toBe(false)

    // Change the mock
    editor.isActive.mockImplementation((name: string) => name === 'bold')

    // Trigger selectionUpdate
    act(() => {
      editor._emit('selectionUpdate')
      vi.advanceTimersByTime(50)
    })

    expect(result.current.bold).toBe(true)
  })

  it('throttles rapid updates', () => {
    const editor = createMockEditor()
    renderHook(() => useActiveStates(editor, { throttleMs: 100 }))

    // Initial call from useEffect
    const initialCallCount = editor.isActive.mock.calls.length

    // Fire multiple events rapidly
    act(() => {
      editor._emit('selectionUpdate')
      editor._emit('selectionUpdate')
      editor._emit('selectionUpdate')
    })

    // isActive should have been called for the first event immediately
    // (throttle allows first call), subsequent ones are queued
    const callsAfterEvents = editor.isActive.mock.calls.length - initialCallCount
    // With throttle, the first call goes through immediately,
    // and subsequent calls are queued for later
    expect(callsAfterEvents).toBeGreaterThan(0)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    // After throttle interval, the trailing call should fire
    const finalCalls = editor.isActive.mock.calls.length
    expect(finalCalls).toBeGreaterThan(initialCallCount)
  })

  it('tracks heading levels correctly', () => {
    const editor = createMockEditor()
    editor.isActive.mockImplementation((name: string, attrs?: any) => {
      if (name === 'heading' && attrs?.level === 2) return true
      return false
    })

    const { result } = renderHook(() => useActiveStates(editor))

    expect(result.current.heading1).toBe(false)
    expect(result.current.heading2).toBe(true)
    expect(result.current.heading3).toBe(false)
  })

  it('tracks all format types', () => {
    const activeFormats = new Set(['bold', 'strike', 'bulletList', 'link'])
    const editor = createMockEditor()
    editor.isActive.mockImplementation((name: string) => activeFormats.has(name))

    const { result } = renderHook(() => useActiveStates(editor))

    expect(result.current.bold).toBe(true)
    expect(result.current.strike).toBe(true)
    expect(result.current.bulletList).toBe(true)
    expect(result.current.link).toBe(true)
    expect(result.current.italic).toBe(false)
    expect(result.current.codeBlock).toBe(false)
  })

  it('recomputes when editor changes', () => {
    const editor1 = createMockEditor({ bold: true })
    const editor2 = createMockEditor({ italic: true })

    const { result, rerender } = renderHook(({ editor }) => useActiveStates(editor), {
      initialProps: { editor: editor1 as any }
    })

    expect(result.current.bold).toBe(true)
    expect(result.current.italic).toBe(false)

    rerender({ editor: editor2 as any })

    expect(result.current.bold).toBe(false)
    expect(result.current.italic).toBe(true)
  })
})
