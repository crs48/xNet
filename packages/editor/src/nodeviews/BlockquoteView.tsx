import { memo } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
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
            'flex-shrink-0 mr-2',
            'font-mono text-muted-foreground',
            'select-none',
            'transition-all duration-150 ease-out',
            isFocused ? 'opacity-50 w-auto' : 'opacity-0 w-0 overflow-hidden'
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
