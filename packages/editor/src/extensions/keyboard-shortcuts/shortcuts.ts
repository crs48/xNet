import type { KeyboardShortcut } from './types'
import { formatShortcut } from './types'

/**
 * All keyboard shortcuts organized by category.
 * Most of these are already handled by TipTap extensions (StarterKit, etc.),
 * but we define them here for display in the help modal and for reference.
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // ─── Formatting ───
  {
    id: 'bold',
    name: 'Bold',
    description: 'Toggle bold formatting',
    keys: 'Mod-b',
    display: formatShortcut('Mod-b'),
    category: 'formatting',
    command: (editor) => editor.chain().focus().toggleBold().run()
  },
  {
    id: 'italic',
    name: 'Italic',
    description: 'Toggle italic formatting',
    keys: 'Mod-i',
    display: formatShortcut('Mod-i'),
    category: 'formatting',
    command: (editor) => editor.chain().focus().toggleItalic().run()
  },
  {
    id: 'strikethrough',
    name: 'Strikethrough',
    description: 'Toggle strikethrough formatting',
    keys: 'Mod-Shift-s',
    display: formatShortcut('Mod-Shift-s'),
    category: 'formatting',
    command: (editor) => editor.chain().focus().toggleStrike().run()
  },
  {
    id: 'code',
    name: 'Inline Code',
    description: 'Toggle inline code formatting',
    keys: 'Mod-e',
    display: formatShortcut('Mod-e'),
    category: 'formatting',
    command: (editor) => editor.chain().focus().toggleCode().run()
  },
  {
    id: 'link',
    name: 'Link',
    description: 'Add or edit link',
    keys: 'Mod-k',
    display: formatShortcut('Mod-k'),
    category: 'formatting',
    command: (editor) => {
      const previousUrl = editor.getAttributes('link').href
      const url = typeof window !== 'undefined' ? window.prompt('URL', previousUrl) : null
      if (url === null) return false
      if (url === '') {
        return editor.chain().focus().unsetLink().run()
      }
      return editor.chain().focus().setLink({ href: url }).run()
    }
  },
  {
    id: 'clear-formatting',
    name: 'Clear Formatting',
    description: 'Remove all formatting from selection',
    keys: 'Mod-\\',
    display: formatShortcut('Mod-\\'),
    category: 'formatting',
    command: (editor) => editor.chain().focus().clearNodes().unsetAllMarks().run()
  },

  // ─── Blocks ───
  {
    id: 'heading-1',
    name: 'Heading 1',
    description: 'Convert to heading 1',
    keys: 'Mod-Alt-1',
    display: formatShortcut('Mod-Alt-1'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
  },
  {
    id: 'heading-2',
    name: 'Heading 2',
    description: 'Convert to heading 2',
    keys: 'Mod-Alt-2',
    display: formatShortcut('Mod-Alt-2'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    id: 'heading-3',
    name: 'Heading 3',
    description: 'Convert to heading 3',
    keys: 'Mod-Alt-3',
    display: formatShortcut('Mod-Alt-3'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
  },
  {
    id: 'paragraph',
    name: 'Paragraph',
    description: 'Convert to paragraph',
    keys: 'Mod-Alt-0',
    display: formatShortcut('Mod-Alt-0'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().setParagraph().run()
  },
  {
    id: 'blockquote',
    name: 'Blockquote',
    description: 'Toggle blockquote',
    keys: 'Mod-Shift-b',
    display: formatShortcut('Mod-Shift-b'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    id: 'code-block',
    name: 'Code Block',
    description: 'Toggle code block',
    keys: 'Mod-Alt-c',
    display: formatShortcut('Mod-Alt-c'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    id: 'horizontal-rule',
    name: 'Divider',
    description: 'Insert horizontal rule',
    keys: 'Mod-Alt-minus',
    display: formatShortcut('Mod-Alt-minus'),
    category: 'blocks',
    command: (editor) => editor.chain().focus().setHorizontalRule().run()
  },

  // ─── Lists ───
  {
    id: 'bullet-list',
    name: 'Bullet List',
    description: 'Toggle bullet list',
    keys: 'Mod-Shift-8',
    display: formatShortcut('Mod-Shift-8'),
    category: 'lists',
    command: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    id: 'ordered-list',
    name: 'Numbered List',
    description: 'Toggle numbered list',
    keys: 'Mod-Shift-7',
    display: formatShortcut('Mod-Shift-7'),
    category: 'lists',
    command: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    id: 'task-list',
    name: 'Task List',
    description: 'Toggle task list',
    keys: 'Mod-Shift-9',
    display: formatShortcut('Mod-Shift-9'),
    category: 'lists',
    command: (editor) => editor.chain().focus().toggleTaskList().run()
  },

  // ─── Editor ───
  {
    id: 'hard-break',
    name: 'Line Break',
    description: 'Insert line break (soft return)',
    keys: 'Shift-Enter',
    display: { mac: '⇧↵', windows: 'Shift+Enter' },
    category: 'editor',
    command: (editor) => editor.chain().focus().setHardBreak().run()
  }
]

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(category: KeyboardShortcut['category']): KeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS.filter((s) => s.category === category)
}

/**
 * Get a shortcut by ID
 */
export function getShortcutById(id: string): KeyboardShortcut | undefined {
  return KEYBOARD_SHORTCUTS.find((s) => s.id === id)
}

/**
 * Get all shortcuts as a map keyed by their key combination
 */
export function getShortcutsMap(): Map<string, KeyboardShortcut> {
  return new Map(KEYBOARD_SHORTCUTS.map((s) => [s.keys, s]))
}
