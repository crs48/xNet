/**
 * @vitest-environment jsdom
 */

/**
 * Tests for ShortcutManager
 */
import type { CommandContribution } from '../contributions'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShortcutManager, getShortcutManager } from '../shortcuts'

// Mock navigator.platform by overriding the property on the existing navigator
const mockNavigator = (platform: string) => {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true
  })
  Object.defineProperty(navigator, 'userAgent', {
    value: platform.includes('Mac') ? 'Mac' : '',
    writable: true,
    configurable: true
  })
}

describe('ShortcutManager', () => {
  let manager: ShortcutManager

  beforeEach(() => {
    manager = new ShortcutManager()
  })

  afterEach(() => {
    // Reset navigator.platform to jsdom default
    Object.defineProperty(navigator, 'platform', {
      value: '',
      writable: true,
      configurable: true
    })
    Object.defineProperty(navigator, 'userAgent', {
      value: '',
      writable: true,
      configurable: true
    })
  })

  describe('register', () => {
    it('registers a command with keybinding', () => {
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute: vi.fn()
      }

      const disposable = manager.register(cmd)
      expect(manager.getAll()).toContain(cmd)

      disposable.dispose()
      expect(manager.getAll()).not.toContain(cmd)
    })

    it('returns no-op disposable when no keybinding', () => {
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        execute: vi.fn()
      }

      const disposable = manager.register(cmd)
      disposable.dispose() // Should not throw
      expect(manager.getAll()).toHaveLength(0)
    })
  })

  describe('unregister', () => {
    it('unregisters by command ID', () => {
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute: vi.fn()
      }

      manager.register(cmd)
      expect(manager.unregister('test-cmd')).toBe(true)
      expect(manager.getAll()).toHaveLength(0)
    })

    it('returns false for unknown command', () => {
      expect(manager.unregister('unknown')).toBe(false)
    })
  })

  describe('handleKeyDown', () => {
    it('executes matching command', () => {
      mockNavigator('MacIntel')

      const execute = vi.fn()
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute
      }

      manager.register(cmd)

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true
      })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() })

      const handled = manager.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(execute).toHaveBeenCalled()
    })

    it('does not execute when disabled', () => {
      const execute = vi.fn()
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute
      }

      manager.register(cmd)
      manager.setEnabled(false)

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true
      })

      const handled = manager.handleKeyDown(event)

      expect(handled).toBe(false)
      expect(execute).not.toHaveBeenCalled()
    })

    it('respects command when() condition', () => {
      mockNavigator('MacIntel')

      const execute = vi.fn()
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute,
        when: () => false
      }

      manager.register(cmd)

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true
      })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })

      const handled = manager.handleKeyDown(event)

      expect(handled).toBe(false)
      expect(execute).not.toHaveBeenCalled()
    })

    it('skips shortcuts in input elements', () => {
      const execute = vi.fn()
      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-K',
        execute
      }

      manager.register(cmd)

      // Create a mock input element
      const input = document.createElement('input')
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true
      })
      Object.defineProperty(event, 'target', { value: input })

      const handled = manager.handleKeyDown(event)

      expect(handled).toBe(false)
      expect(execute).not.toHaveBeenCalled()
    })

    it('allows Escape in input elements', () => {
      mockNavigator('MacIntel')

      const execute = vi.fn()
      const cmd: CommandContribution = {
        id: 'close',
        name: 'Close',
        keybinding: 'Escape',
        execute
      }

      manager.register(cmd)

      const input = document.createElement('input')
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      })
      Object.defineProperty(event, 'target', { value: input })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() })

      const handled = manager.handleKeyDown(event)

      expect(handled).toBe(true)
      expect(execute).toHaveBeenCalled()
    })
  })

  describe('getShortcut', () => {
    it('returns shortcut for command ID', () => {
      mockNavigator('MacIntel')

      const cmd: CommandContribution = {
        id: 'test-cmd',
        name: 'Test Command',
        keybinding: 'Mod-Shift-K',
        execute: vi.fn()
      }

      manager.register(cmd)
      const shortcut = manager.getShortcut('test-cmd')

      expect(shortcut).toBeDefined()
      expect(shortcut).toContain('K')
    })

    it('returns undefined for unknown command', () => {
      expect(manager.getShortcut('unknown')).toBeUndefined()
    })
  })

  describe('formatForDisplay', () => {
    it('formats shortcuts for Mac', () => {
      mockNavigator('MacIntel')
      const manager = new ShortcutManager()

      expect(manager.formatForDisplay('Mod-Shift-K')).toBe('⌘⇧K')
      expect(manager.formatForDisplay('Ctrl-Alt-P')).toBe('⌃⌥P')
    })

    it('formats shortcuts for Windows/Linux', () => {
      mockNavigator('Win32')
      const manager = new ShortcutManager()

      expect(manager.formatForDisplay('Mod-Shift-K')).toBe('Ctrl+Shift+K')
      expect(manager.formatForDisplay('Alt-P')).toBe('Alt+P')
    })
  })

  describe('setEnabled / isEnabled', () => {
    it('toggles enabled state', () => {
      expect(manager.isEnabled()).toBe(true)
      manager.setEnabled(false)
      expect(manager.isEnabled()).toBe(false)
      manager.setEnabled(true)
      expect(manager.isEnabled()).toBe(true)
    })
  })

  describe('clear', () => {
    it('removes all shortcuts', () => {
      manager.register({
        id: 'cmd1',
        name: 'Command 1',
        keybinding: 'Mod-1',
        execute: vi.fn()
      })
      manager.register({
        id: 'cmd2',
        name: 'Command 2',
        keybinding: 'Mod-2',
        execute: vi.fn()
      })

      expect(manager.getAll()).toHaveLength(2)
      manager.clear()
      expect(manager.getAll()).toHaveLength(0)
    })
  })
})

describe('getShortcutManager', () => {
  it('returns singleton instance', () => {
    const m1 = getShortcutManager()
    const m2 = getShortcutManager()
    expect(m1).toBe(m2)
  })
})
