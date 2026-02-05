import type { KeyboardShortcut } from './types'
import { Extension } from '@tiptap/core'
import { KEYBOARD_SHORTCUTS } from './shortcuts'

export interface KeyboardShortcutsOptions {
  /** Additional custom shortcuts to register */
  customShortcuts?: KeyboardShortcut[]
  /** Shortcut IDs to disable */
  disabledShortcuts?: string[]
}

/**
 * Extension that registers additional keyboard shortcuts not covered by
 * StarterKit or other extensions. Also provides shortcut definitions for
 * the help modal.
 *
 * Most formatting/block shortcuts are already handled by TipTap's built-in
 * extensions. This extension adds:
 * - Mod-e for inline code
 * - Mod-k for links
 * - Mod-\ for clear formatting
 * - Mod-Shift-9 for task lists
 */
export const KeyboardShortcutsExtension = Extension.create<KeyboardShortcutsOptions>({
  name: 'keyboardShortcutsExtension',

  addOptions() {
    return {
      customShortcuts: [],
      disabledShortcuts: []
    }
  },

  addKeyboardShortcuts() {
    const { customShortcuts, disabledShortcuts } = this.options
    const editor = this.editor

    // Only register shortcuts that aren't already handled by other extensions
    const extraShortcutIds = ['code', 'link', 'clear-formatting', 'task-list']
    const allShortcuts = [...KEYBOARD_SHORTCUTS, ...(customShortcuts || [])]

    const toRegister = allShortcuts.filter(
      (s) => extraShortcutIds.includes(s.id) && !disabledShortcuts?.includes(s.id)
    )

    const shortcuts: Record<string, () => boolean> = {}
    for (const shortcut of toRegister) {
      shortcuts[shortcut.keys] = () => shortcut.command(editor)
    }

    return shortcuts
  }
})

// Re-export everything
export {
  KEYBOARD_SHORTCUTS,
  getShortcutsByCategory,
  getShortcutById,
  getShortcutsMap
} from './shortcuts'
export { formatShortcut, isMac } from './types'
export type { KeyboardShortcut } from './types'
