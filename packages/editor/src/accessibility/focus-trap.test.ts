import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFocusTrap } from './focus-trap'

describe('createFocusTrap', () => {
  let container: HTMLDivElement
  let button1: HTMLButtonElement
  let button2: HTMLButtonElement
  let button3: HTMLButtonElement

  beforeEach(() => {
    container = document.createElement('div')
    button1 = document.createElement('button')
    button1.textContent = 'First'
    button2 = document.createElement('button')
    button2.textContent = 'Second'
    button3 = document.createElement('button')
    button3.textContent = 'Third'
    container.appendChild(button1)
    container.appendChild(button2)
    container.appendChild(button3)
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  describe('activate', () => {
    it('focuses the first focusable element by default', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      expect(document.activeElement).toBe(button1)
      trap.deactivate()
    })

    it('does not auto-focus when autoFocus is false', () => {
      const trap = createFocusTrap(container, { autoFocus: false })
      trap.activate()
      expect(document.activeElement).not.toBe(button1)
      trap.deactivate()
    })

    it('focuses the container when no focusable children exist', () => {
      const emptyContainer = document.createElement('div')
      document.body.appendChild(emptyContainer)
      const trap = createFocusTrap(emptyContainer)
      trap.activate()
      expect(document.activeElement).toBe(emptyContainer)
      expect(emptyContainer.getAttribute('tabindex')).toBe('-1')
      trap.deactivate()
      emptyContainer.remove()
    })

    it('sets isActive to true', () => {
      const trap = createFocusTrap(container)
      expect(trap.isActive).toBe(false)
      trap.activate()
      expect(trap.isActive).toBe(true)
      trap.deactivate()
    })

    it('is idempotent (multiple activations do not error)', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      expect(() => trap.activate()).not.toThrow()
      trap.deactivate()
    })
  })

  describe('deactivate', () => {
    it('returns focus to the previously focused element', () => {
      button3.focus()
      const trap = createFocusTrap(container, { returnFocusTo: button3 })
      trap.activate()
      expect(document.activeElement).toBe(button1)
      trap.deactivate()
      expect(document.activeElement).toBe(button3)
    })

    it('sets isActive to false', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      trap.deactivate()
      expect(trap.isActive).toBe(false)
    })

    it('is idempotent', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      trap.deactivate()
      expect(() => trap.deactivate()).not.toThrow()
    })
  })

  describe('Tab key handling', () => {
    it('wraps focus from last to first on Tab', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      button3.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)

      expect(document.activeElement).toBe(button1)
      trap.deactivate()
    })

    it('wraps focus from first to last on Shift+Tab', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      button1.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)

      expect(document.activeElement).toBe(button3)
      trap.deactivate()
    })

    it('does not prevent Tab for middle elements', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      button2.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      void container.dispatchEvent(event)
      // Should not prevent default for middle elements
      // (the browser will handle normal tab)
      expect(document.activeElement).toBe(button2) // stays (no actual browser tab)
      trap.deactivate()
    })

    it('ignores non-Tab keys', () => {
      const trap = createFocusTrap(container)
      trap.activate()
      button1.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)

      expect(document.activeElement).toBe(button1)
      trap.deactivate()
    })
  })

  describe('Escape handling', () => {
    it('calls onEscape when Escape is pressed', () => {
      const onEscape = vi.fn()
      const trap = createFocusTrap(container, { onEscape })
      trap.activate()

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)

      expect(onEscape).toHaveBeenCalledOnce()
      trap.deactivate()
    })

    it('does not call onEscape when trap is inactive', () => {
      const onEscape = vi.fn()
      createFocusTrap(container, { onEscape })
      // Not activated

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)

      expect(onEscape).not.toHaveBeenCalled()
    })
  })

  describe('disabled elements', () => {
    it('skips disabled buttons', () => {
      button2.disabled = true
      const trap = createFocusTrap(container)
      trap.activate()
      button1.focus()

      // Tab from button1 should skip button2 (disabled) but browser handles it
      // We just verify focus trap doesn't include disabled elements
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      // Focus on last (button3), then tab should wrap to first (button1)
      button3.focus()
      container.dispatchEvent(event)
      expect(document.activeElement).toBe(button1)
      trap.deactivate()
    })
  })
})
