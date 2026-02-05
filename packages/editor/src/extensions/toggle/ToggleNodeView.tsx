/**
 * ToggleNodeView - React NodeView for collapsible toggle blocks.
 *
 * Features:
 * - Click to expand/collapse
 * - Double-click summary to edit
 * - Animated chevron rotation
 */
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'

export function ToggleNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { summary, open } = node.attrs as { summary: string; open: boolean }
  const [isEditingSummary, setIsEditingSummary] = React.useState(false)
  const summaryInputRef = React.useRef<HTMLInputElement>(null)

  const handleToggle = () => {
    updateAttributes({ open: !open })
  }

  const handleSummaryDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingSummary(true)
    setTimeout(() => summaryInputRef.current?.focus(), 0)
  }

  const handleSummaryBlur = () => {
    setIsEditingSummary(false)
  }

  const handleSummaryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      setIsEditingSummary(false)
    }
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'my-2 rounded-lg',
          'border border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* Summary header */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2',
            'cursor-pointer select-none',
            'hover:bg-gray-50 dark:hover:bg-gray-800',
            'rounded-t-lg',
            !open && 'rounded-b-lg'
          )}
          onClick={handleToggle}
        >
          {/* Chevron icon */}
          <svg
            className={cn(
              'w-4 h-4 flex-shrink-0 text-gray-400',
              'transition-transform duration-200',
              open && 'rotate-90'
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Summary text */}
          {isEditingSummary ? (
            <input
              ref={summaryInputRef}
              type="text"
              value={summary}
              onChange={(e) => updateAttributes({ summary: e.target.value })}
              onBlur={handleSummaryBlur}
              onKeyDown={handleSummaryKeyDown}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex-1 px-1 py-0.5 rounded',
                'bg-gray-100 dark:bg-gray-700',
                'border-none outline-none',
                'text-sm font-medium'
              )}
              placeholder="Toggle title"
            />
          ) : (
            <span
              className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300"
              onDoubleClick={handleSummaryDoubleClick}
            >
              {summary || 'Toggle'}
            </span>
          )}
        </div>

        {/* Content (collapsible) */}
        {open && (
          <div className={cn('px-3 pb-3 pl-9', 'border-t border-gray-100 dark:border-gray-800')}>
            <NodeViewContent className="pt-2" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
