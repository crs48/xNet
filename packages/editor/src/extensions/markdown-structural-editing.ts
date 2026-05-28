import type { ResolvedPos } from '@tiptap/pm/model'
import { Extension, type Editor } from '@tiptap/core'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const MIN_HEADING_LEVEL = 1
const MAX_HEADING_LEVEL = 6
const LIST_ITEM_NODE_NAMES = new Set(['listItem', 'taskItem'])

function toHeadingLevel(value: unknown): HeadingLevel {
  const level = typeof value === 'number' ? value : MIN_HEADING_LEVEL
  const boundedLevel = Math.min(Math.max(level, MIN_HEADING_LEVEL), MAX_HEADING_LEVEL)
  return boundedLevel as HeadingLevel
}

function previousHeadingLevel(level: HeadingLevel): HeadingLevel | null {
  return level > MIN_HEADING_LEVEL ? ((level - 1) as HeadingLevel) : null
}

function isDirectChildOfBlockquote($from: ResolvedPos): boolean {
  if ($from.depth < 2) return false
  return $from.node($from.depth - 1).type.name === 'blockquote'
}

function findListItemDepth($from: ResolvedPos): number | null {
  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if (LIST_ITEM_NODE_NAMES.has($from.node(depth).type.name)) {
      return depth
    }
  }

  return null
}

function isAtStartOfFirstListItemBlock($from: ResolvedPos, listItemDepth: number): boolean {
  for (let depth = listItemDepth; depth < $from.depth; depth += 1) {
    if ($from.index(depth) !== 0) return false
  }

  return true
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
  if ($from.parentOffset !== 0) {
    return false
  }

  if ($from.parent.type.name === 'heading') {
    const nextLevel = previousHeadingLevel(toHeadingLevel($from.parent.attrs.level))
    if (nextLevel) {
      return editor.commands.setNode('heading', { level: nextLevel })
    }

    return editor.commands.setParagraph()
  }

  const listItemDepth = findListItemDepth($from)
  if (listItemDepth !== null && isAtStartOfFirstListItemBlock($from, listItemDepth)) {
    return editor.commands.liftListItem($from.node(listItemDepth).type.name)
  }

  if (isDirectChildOfBlockquote($from)) {
    return editor.commands.lift('blockquote')
  }

  return false
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
