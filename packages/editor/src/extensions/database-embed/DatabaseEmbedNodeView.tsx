/**
 * DatabaseEmbedNodeView - React NodeView for inline database views.
 *
 * Features:
 * - Header with database title/icon (resolved via callback)
 * - View type switcher (table/board/list/calendar/gallery/timeline)
 * - Delegates actual view rendering to `renderView` callback from extension options
 * - Placeholder when no renderView is provided
 * - Error state for missing databases
 *
 * No lucide-react: uses inline SVG and emoji for icons.
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'
import type { DatabaseViewType, DatabaseEmbedOptions } from './DatabaseEmbedExtension'

const VIEW_ICONS: Record<DatabaseViewType, string> = {
  table: '\uD83D\uDCCB',
  board: '\uD83D\uDCCC',
  list: '\uD83D\uDCDD',
  calendar: '\uD83D\uDCC5',
  gallery: '\uD83D\uDDBC\uFE0F',
  timeline: '\u23F3'
}

const VIEW_LABELS: Record<DatabaseViewType, string> = {
  table: 'Table',
  board: 'Board',
  list: 'List',
  calendar: 'Calendar',
  gallery: 'Gallery',
  timeline: 'Timeline'
}

const ALL_VIEWS: DatabaseViewType[] = ['table', 'board', 'list', 'calendar', 'gallery', 'timeline']

export function DatabaseEmbedNodeView({
  node,
  selected,
  updateAttributes,
  extension
}: NodeViewProps) {
  const { databaseId, viewType, viewConfig, showTitle, maxHeight } = node.attrs
  const [showViewPicker, setShowViewPicker] = React.useState(false)
  const [dbMeta, setDbMeta] = React.useState<{ title: string; icon?: string } | null>(null)
  const [metaLoading, setMetaLoading] = React.useState(true)
  const pickerRef = React.useRef<HTMLDivElement>(null)

  const options = extension.options as DatabaseEmbedOptions

  // Resolve database metadata
  React.useEffect(() => {
    if (!databaseId || !options.resolveDatabaseMeta) {
      setMetaLoading(false)
      return
    }

    let cancelled = false
    setMetaLoading(true)

    options
      .resolveDatabaseMeta(databaseId)
      .then((meta) => {
        if (!cancelled) {
          setDbMeta(meta)
          setMetaLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMetaLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [databaseId, options.resolveDatabaseMeta])

  // Close picker on outside click
  React.useEffect(() => {
    if (!showViewPicker) return

    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowViewPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showViewPicker])

  // No database ID
  if (!databaseId) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'flex items-center justify-center p-6 rounded-lg my-2',
            'bg-gray-50 dark:bg-gray-800',
            'border border-dashed border-gray-300 dark:border-gray-600',
            'text-gray-400',
            selected && 'ring-2 ring-blue-500 ring-offset-2'
          )}
          data-drag-handle
        >
          <span className="text-sm">No database selected</span>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'rounded-lg my-2 overflow-hidden',
          'border border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-3 py-2',
            'border-b border-gray-200 dark:border-gray-700',
            'bg-gray-50 dark:bg-gray-800'
          )}
        >
          <div className="flex items-center gap-2">
            {/* Database title */}
            {showTitle && (
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                {metaLoading ? (
                  <span className="text-gray-400 animate-pulse">Loading...</span>
                ) : dbMeta ? (
                  <>
                    {dbMeta.icon && <span>{dbMeta.icon}</span>}
                    <span>{dbMeta.title}</span>
                  </>
                ) : (
                  <>
                    <span>\uD83D\uDCCA</span>
                    <span className="text-gray-500 font-mono text-xs">
                      {databaseId.slice(0, 12)}...
                    </span>
                  </>
                )}
              </div>
            )}

            {/* View type picker */}
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setShowViewPicker(!showViewPicker)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  'text-xs text-gray-600 dark:text-gray-400',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'transition-colors'
                )}
                aria-label="Change view type"
              >
                <span>{VIEW_ICONS[viewType as DatabaseViewType] || VIEW_ICONS.table}</span>
                <span>{VIEW_LABELS[viewType as DatabaseViewType] || 'Table'}</span>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showViewPicker && (
                <div
                  className={cn(
                    'absolute top-full left-0 mt-1 z-10',
                    'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
                    'border border-gray-200 dark:border-gray-700',
                    'py-1 min-w-[130px]'
                  )}
                >
                  {ALL_VIEWS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        updateAttributes({ viewType: type })
                        setShowViewPicker(false)
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5',
                        'text-sm text-left',
                        'hover:bg-gray-100 dark:hover:bg-gray-700',
                        viewType === type &&
                          'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      )}
                    >
                      <span>{VIEW_ICONS[type]}</span>
                      <span>{VIEW_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Open externally button */}
          <button
            type="button"
            onClick={() => {
              // Dispatch a custom event that the app can listen to
              window.dispatchEvent(
                new CustomEvent('xnet:open-database', { detail: { databaseId } })
              )
            }}
            className={cn(
              'p-1.5 rounded',
              'text-gray-500 hover:text-gray-700',
              'dark:text-gray-400 dark:hover:text-gray-300',
              'hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
            aria-label="Open database"
            title="Open database"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </button>
        </div>

        {/* Database view content */}
        <div className="overflow-auto" style={{ maxHeight: maxHeight || 400 }}>
          {options.renderView ? (
            options.renderView({
              databaseId,
              viewType: viewType as DatabaseViewType,
              viewConfig: viewConfig || {}
            })
          ) : (
            <div className="p-6 text-center text-gray-400">
              <p className="text-sm font-medium">
                {VIEW_ICONS[viewType as DatabaseViewType] || '\uD83D\uDCCA'}{' '}
                {VIEW_LABELS[viewType as DatabaseViewType] || 'Table'} View
              </p>
              <p className="text-xs mt-1">Connect a view renderer to display database content</p>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
