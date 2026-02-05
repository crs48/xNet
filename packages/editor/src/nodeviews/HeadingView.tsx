import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { memo, useMemo } from 'react'
import { cn } from '../utils'
import { useNodeFocus } from './hooks/useNodeFocus'

interface HeadingAttrs {
  level: 1 | 2 | 3 | 4 | 5 | 6
}

const HEADING_STYLES: Record<number, string> = {
  1: 'text-3xl font-bold mt-8 mb-4 leading-tight',
  2: 'text-2xl font-semibold mt-6 mb-3 leading-snug',
  3: 'text-xl font-medium mt-5 mb-2 leading-snug',
  4: 'text-lg font-medium mt-4 mb-2',
  5: 'text-base font-medium mt-3 mb-1',
  6: 'text-sm font-medium mt-3 mb-1 text-muted-foreground'
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
      className={cn('heading-line group relative', HEADING_STYLES[level] || HEADING_STYLES[3])}
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
