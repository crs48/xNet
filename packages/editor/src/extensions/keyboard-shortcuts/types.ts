import type { Editor } from '@tiptap/core'

/**
 * A keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** Unique identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what the shortcut does */
  description: string
  /** Key combination (TipTap format: 'Mod-b', 'Mod-Shift-1') */
  keys: string
  /** Display string for the shortcut */
  display: {
    mac: string
    windows: string
  }
  /** Category for grouping */
  category: 'formatting' | 'blocks' | 'lists' | 'navigation' | 'editor'
  /** The command to execute */
  command: (editor: Editor) => boolean
}

/**
 * Check if running on macOS
 */
export const isMac =
  typeof navigator !== 'undefined' ? /Mac|iPod|iPhone|iPad/.test(navigator.platform) : false

/**
 * Format a key combination string into platform-specific display strings.
 *
 * @example
 * formatShortcut('Mod-b')      // { mac: '⌘B', windows: 'Ctrl+B' }
 * formatShortcut('Mod-Shift-s') // { mac: '⌘⇧S', windows: 'Ctrl+Shift+S' }
 */
export function formatShortcut(keys: string): { mac: string; windows: string } {
  const parts = keys.split('-')

  const macParts = parts.map((part) => {
    switch (part) {
      case 'Mod':
        return '⌘'
      case 'Ctrl':
        return '⌃'
      case 'Alt':
        return '⌥'
      case 'Shift':
        return '⇧'
      default:
        return part.toUpperCase()
    }
  })

  const winParts = parts.map((part) => {
    switch (part) {
      case 'Mod':
        return 'Ctrl'
      case 'Ctrl':
        return 'Ctrl'
      case 'Alt':
        return 'Alt'
      case 'Shift':
        return 'Shift'
      default:
        return part.toUpperCase()
    }
  })

  return {
    mac: macParts.join(''),
    windows: winParts.join('+')
  }
}
