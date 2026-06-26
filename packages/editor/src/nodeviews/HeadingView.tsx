import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { memo, useMemo } from 'react'
import { cn } from '../utils'
import { useNodeFocus } from './hooks/useNodeFocus'

interface HeadingAttrs {
  level: 1 | 2 | 3 | 4 | 5 | 6
}

function getHeadingPrefix(level: number): string {
  return '#'.repeat(level) + ' '
}

/**
 * HeadingView - Obsidian-style heading with visible markdown prefix.
 *
 * Shows the `#` characters when the cursor is inside the heading,
 * hidden (with fade) when the cursor is elsewhere.
 */
export const HeadingView = memo(function HeadingView({ node, editor, getPos }: NodeViewProps) {
  const level = (node.attrs as HeadingAttrs).level
  const isFocused = useNodeFocus(editor, getPos)
  const prefix = useMemo(() => getHeadingPrefix(level), [level])
  const Tag = `h${level}` as const

  return (
    <NodeViewWrapper
      as={Tag}
      // Size/weight/line-height/margins come from the `.ProseMirror h1..h6`
      // tag rules in editor.css (single source of truth); the node view only
      // adds the markdown-prefix affordance.
      className={cn('heading-line group relative')}
      data-level={level}
      data-focused={isFocused}
    >
      {/* Markdown prefix - positioned in the left margin */}
      <span
        className={cn(
          'heading-syntax',
          'absolute right-full mr-1',
          'font-mono font-normal',
          'text-muted-foreground',
          'select-none',
          'pointer-events-none',
          'transition-opacity duration-150 ease-out',
          isFocused ? 'opacity-50' : 'opacity-0'
        )}
        contentEditable={false}
        aria-hidden="true"
      >
        {prefix}
      </span>

      {/* Heading content - editable */}
      <NodeViewContent className="outline-none inline" />
    </NodeViewWrapper>
  )
})
