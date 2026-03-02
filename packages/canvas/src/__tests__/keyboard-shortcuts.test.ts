/**
 * Keyboard shortcut tests for canvas renderer helpers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleUndoRedoShortcut } from '../renderer/keyboard-shortcuts'

afterEach(() => {
  document.body.innerHTML = ''
})

function createEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: 'z',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides
  } as Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'preventDefault'> & {
    preventDefault: ReturnType<typeof vi.fn>
  }
}

describe('handleUndoRedoShortcut', () => {
  it('handles Cmd+Z as undo when canvas is focused', () => {
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.appendChild(container)
    container.focus()

    const undo = vi.fn()
    const redo = vi.fn()
    const event = createEvent({ metaKey: true, key: 'z' })

    const handled = handleUndoRedoShortcut(event, container, document.activeElement, {
      undo,
      redo
    })

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(undo).toHaveBeenCalledOnce()
    expect(redo).not.toHaveBeenCalled()
  })

  it('handles Cmd+Shift+Z as redo', () => {
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.appendChild(container)
    container.focus()

    const undo = vi.fn()
    const redo = vi.fn()
    const event = createEvent({ metaKey: true, shiftKey: true, key: 'z' })

    const handled = handleUndoRedoShortcut(event, container, document.activeElement, {
      undo,
      redo
    })

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
    expect(redo).toHaveBeenCalledOnce()
  })

  it('handles Ctrl+Y as redo', () => {
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.appendChild(container)
    container.focus()

    const undo = vi.fn()
    const redo = vi.fn()
    const event = createEvent({ ctrlKey: true, key: 'y' })

    const handled = handleUndoRedoShortcut(event, container, document.activeElement, {
      undo,
      redo
    })

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
    expect(redo).toHaveBeenCalledOnce()
  })

  it('does not handle shortcuts while typing in input', () => {
    const container = document.createElement('div')
    const input = document.createElement('input')
    container.appendChild(input)
    document.body.appendChild(container)
    input.focus()

    const undo = vi.fn()
    const redo = vi.fn()
    const event = createEvent({ metaKey: true, key: 'z' })

    const handled = handleUndoRedoShortcut(event, container, document.activeElement, {
      undo,
      redo
    })

    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(undo).not.toHaveBeenCalled()
    expect(redo).not.toHaveBeenCalled()
  })
})
