/**
 * CalloutNodeView - React NodeView for callout blocks.
 *
 * Features:
 * - Collapsible content
 * - Inline title editing (double-click)
 * - Type picker dropdown
 * - Color-coded by type
 */
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'
import { CALLOUT_CONFIGS, type CalloutType } from './types'

export function CalloutNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { type, title, collapsed } = node.attrs as {
    type: CalloutType
    title: string | null
    collapsed: boolean
  }

  const config = CALLOUT_CONFIGS[type] || CALLOUT_CONFIGS.info
  const [isEditing, setIsEditing] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)

  const handleToggleCollapse = () => {
    updateAttributes({ collapsed: !collapsed })
  }

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  const handleTitleBlur = () => {
    setIsEditing(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'rounded-lg border-l-4 my-4',
          config.bgClass,
          config.borderClass,
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* Header */}
        <div
          className={cn('flex items-center gap-2 px-4 py-2', 'cursor-pointer select-none')}
          onClick={handleToggleCollapse}
        >
          {/* Collapse chevron */}
          <button
            type="button"
            className={cn('p-0.5 rounded text-gray-400', 'hover:bg-black/5 dark:hover:bg-white/5')}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              className={cn('w-4 h-4 transition-transform', !collapsed && 'rotate-90')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Icon */}
          <span className="text-lg" role="img" aria-label={config.label}>
            {config.icon}
          </span>

          {/* Title */}
          {isEditing ? (
            <input
              ref={titleInputRef}
              type="text"
              value={title || ''}
              onChange={(e) => updateAttributes({ title: e.target.value })}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex-1 px-1 py-0.5 rounded',
                'bg-transparent border-none outline-none',
                'text-sm font-medium',
                config.titleClass
              )}
              placeholder={config.label}
            />
          ) : (
            <span
              className={cn('text-sm font-medium', config.titleClass)}
              onDoubleClick={handleTitleDoubleClick}
              onClick={(e) => e.stopPropagation()}
            >
              {title || config.label}
            </span>
          )}

          {/* Type picker */}
          <CalloutTypePicker
            currentType={type}
            onChange={(newType) => updateAttributes({ type: newType })}
          />
        </div>

        {/* Content */}
        {!collapsed && (
          <div className="px-4 pb-3 pl-11">
            <NodeViewContent />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function CalloutTypePicker({
  currentType,
  onChange
}: {
  currentType: CalloutType
  onChange: (type: CalloutType) => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className={cn(
          'px-2 py-0.5 rounded text-xs',
          'hover:bg-black/5 dark:hover:bg-white/5',
          'text-gray-500'
        )}
        aria-label="Change callout type"
      >
        {currentType}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className={cn(
              'absolute right-0 top-full mt-1 z-20',
              'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
              'border border-gray-200 dark:border-gray-700',
              'py-1 min-w-[120px]'
            )}
            role="listbox"
            aria-label="Callout types"
          >
            {(Object.keys(CALLOUT_CONFIGS) as CalloutType[]).map((calloutType) => {
              const cfg = CALLOUT_CONFIGS[calloutType]
              return (
                <button
                  key={calloutType}
                  type="button"
                  role="option"
                  aria-selected={currentType === calloutType}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(calloutType)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5',
                    'text-sm text-left',
                    'hover:bg-gray-100 dark:hover:bg-gray-700',
                    currentType === calloutType && 'bg-gray-100 dark:bg-gray-700'
                  )}
                >
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
