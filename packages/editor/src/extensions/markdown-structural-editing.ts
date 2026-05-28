import { Extension, type Editor } from '@tiptap/core'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const MIN_HEADING_LEVEL = 1
const MAX_HEADING_LEVEL = 6

function toHeadingLevel(value: unknown): HeadingLevel {
  const level = typeof value === 'number' ? value : MIN_HEADING_LEVEL
  const boundedLevel = Math.min(Math.max(level, MIN_HEADING_LEVEL), MAX_HEADING_LEVEL)
  return boundedLevel as HeadingLevel
}

function previousHeadingLevel(level: HeadingLevel): HeadingLevel | null {
  return level > MIN_HEADING_LEVEL ? ((level - 1) as HeadingLevel) : null
}

/**
 * Handle structural Markdown Backspace behavior for rendered Markdown blocks.
 *
 * This gives heading prefixes source-like Backspace semantics without storing
 * the literal `#` characters in the ProseMirror document.
 */
export function runMarkdownStructuralBackspace(editor: Editor): boolean {
  const { selection } = editor.state

  if (!selection.empty) {
    return false
  }

  const { $from } = selection
  if ($from.parentOffset !== 0 || $from.parent.type.name !== 'heading') {
    return false
  }

  const nextLevel = previousHeadingLevel(toHeadingLevel($from.parent.attrs.level))
  if (nextLevel) {
    return editor.commands.setNode('heading', { level: nextLevel })
  }

  return editor.commands.setParagraph()
}

export const MarkdownStructuralEditing = Extension.create({
  name: 'markdownStructuralEditing',

  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: () => runMarkdownStructuralBackspace(this.editor)
    }
  }
})
