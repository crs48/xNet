/**
 * Keyboard Shortcut Manager
 *
 * Handles registration and execution of keyboard shortcuts from plugins.
 */

import type { CommandContribution } from './contributions'
import type { Disposable } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Platform detection for modifier key normalization
 */
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac')
}

// ─── ShortcutManager ─────────────────────────────────────────────────────────

/**
 * Manages keyboard shortcuts for commands.
 *
 * Shortcuts are specified in the format: "Mod-Shift-K" where:
 * - Mod = Cmd on Mac, Ctrl elsewhere
 * - Shift, Alt, Ctrl, Meta are modifier keys
 * - The last part is the key name (e.g., K, Enter, Escape)
 *
 * @example
 * ```typescript
 * const manager = new ShortcutManager()
 *
 * manager.register({
 *   id: 'my-command',
 *   name: 'My Command',
 *   keybinding: 'Mod-Shift-P',
 *   execute: () => console.log('Executed!')
 * })
 *
 * // Attach to window
 * window.addEventListener('keydown', (e) => manager.handleKeyDown(e))
 * ```
 */
export class ShortcutManager {
  private shortcuts = new Map<string, CommandContribution>()
  private enabled = true

  /**
   * Register a command with a keyboard shortcut.
   *
   * @param command - Command with keybinding
   * @returns Disposable to unregister the shortcut
   */
  register(command: CommandContribution): Disposable {
    if (!command.keybinding) {
      return { dispose: () => {} }
    }

    const normalized = this.normalize(command.keybinding)
    this.shortcuts.set(normalized, command)

    return {
      dispose: () => {
        this.shortcuts.delete(normalized)
      }
    }
  }

  /**
   * Unregister a command by ID.
   */
  unregister(commandId: string): boolean {
    for (const [key, cmd] of this.shortcuts) {
      if (cmd.id === commandId) {
        return this.shortcuts.delete(key)
      }
    }
    return false
  }

  /**
   * Handle a keyboard event.
   *
   * @param event - Keyboard event
   * @returns True if a shortcut was triggered
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.enabled) return false

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement | null
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      // Allow Escape to blur from inputs
      if (event.key !== 'Escape') {
        return false
      }
    }

    // Also skip if in contenteditable (rich text editor)
    if (target?.isContentEditable) {
      // Allow certain global shortcuts even in editor
      const key = this.eventToString(event)
      const command = this.shortcuts.get(key)
      // Only process if it's explicitly marked as global or is common navigational
      if (!command) return false
    }

    const key = this.eventToString(event)
    const command = this.shortcuts.get(key)

    if (command) {
      // Check if command is enabled
      if (command.when && !command.when()) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()

      // Execute asynchronously
      Promise.resolve(command.execute()).catch((err) => {
        console.error(`[ShortcutManager] Command '${command.id}' failed:`, err)
      })

      return true
    }

    return false
  }

  /**
   * Enable or disable shortcut handling.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Check if shortcuts are enabled.
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get all registered shortcuts.
   */
  getAll(): CommandContribution[] {
    return [...this.shortcuts.values()]
  }

  /**
   * Get the shortcut for a command ID.
   */
  getShortcut(commandId: string): string | undefined {
    for (const [key, cmd] of this.shortcuts) {
      if (cmd.id === commandId) {
        return this.denormalize(key)
      }
    }
    return undefined
  }

  /**
   * Format a keybinding for display (using platform-specific symbols).
   */
  formatForDisplay(keybinding: string): string {
    const mac = isMac()
    return keybinding
      .replace(/Mod/g, mac ? '⌘' : 'Ctrl')
      .replace(/Ctrl/g, mac ? '⌃' : 'Ctrl')
      .replace(/Alt/g, mac ? '⌥' : 'Alt')
      .replace(/Shift/g, mac ? '⇧' : 'Shift')
      .replace(/Meta/g, mac ? '⌘' : 'Win')
      .replace(/-/g, mac ? '' : '+')
  }

  /**
   * Normalize a keybinding string for consistent lookup.
   */
  private normalize(keybinding: string): string {
    const mac = isMac()
    const parts = keybinding
      .replace(/Mod/g, mac ? 'Meta' : 'Ctrl')
      .split('-')
      .map((p) => p.toLowerCase())

    // Sort modifiers for consistent comparison
    const modifiers = ['ctrl', 'meta', 'alt', 'shift']
    const sortedModifiers = parts.filter((p) => modifiers.includes(p)).sort()
    const key = parts.filter((p) => !modifiers.includes(p))[0] ?? ''

    return [...sortedModifiers, key].join('-')
  }

  /**
   * Convert normalized form back to display form.
   */
  private denormalize(normalized: string): string {
    const mac = isMac()
    return normalized
      .split('-')
      .map((part) => {
        if (part === 'ctrl') return 'Ctrl'
        if (part === 'meta') return mac ? 'Cmd' : 'Ctrl'
        if (part === 'alt') return 'Alt'
        if (part === 'shift') return 'Shift'
        return part.toUpperCase()
      })
      .join('-')
  }

  /**
   * Convert a keyboard event to a normalized string.
   */
  private eventToString(event: KeyboardEvent): string {
    const modifiers: string[] = []

    if (event.ctrlKey) modifiers.push('ctrl')
    if (event.metaKey) modifiers.push('meta')
    if (event.altKey) modifiers.push('alt')
    if (event.shiftKey) modifiers.push('shift')

    // Get the key name
    let key = event.key.toLowerCase()

    // Normalize some common keys
    if (key === ' ') key = 'space'
    if (key === 'arrowup') key = 'up'
    if (key === 'arrowdown') key = 'down'
    if (key === 'arrowleft') key = 'left'
    if (key === 'arrowright') key = 'right'

    // Don't include modifier keys as the main key
    if (['control', 'meta', 'alt', 'shift'].includes(key)) {
      return ''
    }

    // Sort modifiers for consistent comparison, then append key
    // (must match normalize() which does: sorted modifiers + key)
    return [...modifiers.sort(), key].join('-')
  }

  /**
   * Clear all registered shortcuts.
   */
  clear(): void {
    this.shortcuts.clear()
  }
}

/**
 * Global shortcut manager instance.
 */
let globalShortcutManager: ShortcutManager | null = null

/**
 * Get or create the global ShortcutManager instance.
 */
export function getShortcutManager(): ShortcutManager {
  if (!globalShortcutManager) {
    globalShortcutManager = new ShortcutManager()
  }
  return globalShortcutManager
}

/**
 * Install the global shortcut manager on the window.
 * Call this once at app startup.
 */
export function installShortcutHandler(): () => void {
  const manager = getShortcutManager()

  const handler = (event: KeyboardEvent) => {
    manager.handleKeyDown(event)
  }

  window.addEventListener('keydown', handler, true)

  return () => {
    window.removeEventListener('keydown', handler, true)
  }
}
