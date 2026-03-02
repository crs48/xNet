import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { memo } from 'react'
import { cn } from '../utils'
import { useNodeFocus } from './hooks/useNodeFocus'

/**
 * BlockquoteView - Shows `>` prefix when focused.
 */
export const BlockquoteView = memo(function BlockquoteView({ editor, getPos }: NodeViewProps) {
  const isFocused = useNodeFocus(editor, getPos)

  return (
    <NodeViewWrapper
      as="blockquote"
      className={cn(
        'blockquote-wrapper',
        'relative my-4 pl-4',
        'border-l-4 border-primary',
        'transition-colors duration-150',
        isFocused && 'border-primary/70'
      )}
      data-focused={isFocused}
    >
      <div className="flex">
        {/* Quote prefix - visible when focused */}
        <span
          className={cn(
            'blockquote-syntax',
            'flex-shrink-0 mr-2 w-3',
            'font-mono text-muted-foreground',
            'select-none',
            'transition-opacity duration-150 ease-out',
            isFocused ? 'opacity-50' : 'opacity-0'
          )}
          contentEditable={false}
          aria-hidden="true"
        >
          &gt;
        </span>

        {/* Quote content */}
        <NodeViewContent className="flex-1 outline-none" />
      </div>
    </NodeViewWrapper>
  )
})
