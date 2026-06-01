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
import type { DatabaseViewType, DatabaseEmbedOptions } from './DatabaseEmbedExtension'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'

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

function stopEditorMouseDown(event: React.MouseEvent<HTMLElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

function stopEditorSurfaceMouseDown(event: React.MouseEvent<HTMLElement>): void {
  event.stopPropagation()
}

function normalizeDatabaseId(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeDatabaseViewType(value: unknown): DatabaseViewType {
  return ALL_VIEWS.includes(value as DatabaseViewType) ? (value as DatabaseViewType) : 'table'
}

function DatabaseEmbedSetupCard({
  initialViewType,
  options,
  selected,
  updateAttributes
}: {
  initialViewType: DatabaseViewType
  options: DatabaseEmbedOptions
  selected: boolean
  updateAttributes: NodeViewProps['updateAttributes']
}): JSX.Element {
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [databaseId, setDatabaseId] = React.useState('')
  const [viewType, setViewType] = React.useState<DatabaseViewType>(initialViewType)
  const [error, setError] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState(false)

  React.useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const applyDatabaseEmbed = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const normalizedId = normalizeDatabaseId(databaseId)
      if (!normalizedId) {
        setError('Enter a database ID')
        inputRef.current?.focus()
        return
      }

      updateAttributes({
        databaseId: normalizedId,
        viewType,
        viewConfig: {}
      })
    },
    [databaseId, updateAttributes, viewType]
  )

  const pickDatabase = React.useCallback(async () => {
    if (!options.onSelectDatabase) return

    setPicking(true)
    setError(null)
    try {
      const selectedDatabaseId = await options.onSelectDatabase()
      if (selectedDatabaseId) {
        setDatabaseId(selectedDatabaseId)
      }
    } finally {
      setPicking(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [options])

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-database-embed=""
      data-database-embed-empty="true"
      data-database-embed-selected={selected ? 'true' : 'false'}
    >
      <form
        data-testid="database-embed-setup"
        className={cn(
          'my-2 rounded-lg border border-dashed bg-white p-3 shadow-sm transition-colors',
          'border-gray-300 dark:border-gray-700 dark:bg-gray-900',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        onMouseDown={stopEditorSurfaceMouseDown}
        onSubmit={applyDatabaseEmbed}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Database embed
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Connect a database ID and view
            </div>
          </div>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            {VIEW_ICONS[viewType]}
          </span>
        </div>

        <label htmlFor={inputId} className="sr-only">
          Database ID
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            value={databaseId}
            placeholder="Database ID"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={cn(
              'min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm',
              'outline-none transition-colors placeholder:text-gray-400',
              'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              'dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
            )}
            onChange={(event) => {
              setDatabaseId(event.target.value)
              setError(null)
            }}
          />
          {options.onSelectDatabase && (
            <button
              type="button"
              className="h-9 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              disabled={picking}
              onClick={() => {
                void pickDatabase()
              }}
            >
              Pick
            </button>
          )}
          <button
            type="submit"
            className="h-9 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Insert
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-3 grid grid-cols-3 gap-1" role="radiogroup" aria-label="Database view">
          {ALL_VIEWS.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={viewType === type}
              aria-label={`${VIEW_LABELS[type]} view`}
              className={cn(
                'h-8 rounded-md border px-2 text-xs font-medium transition-colors',
                viewType === type
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
              )}
              onClick={() => setViewType(type)}
            >
              {VIEW_LABELS[type]}
            </button>
          ))}
        </div>
      </form>
    </NodeViewWrapper>
  )
}

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
      <DatabaseEmbedSetupCard
        initialViewType={normalizeDatabaseViewType(viewType)}
        options={options}
        selected={selected}
        updateAttributes={updateAttributes}
      />
    )
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-database-embed=""
      data-database-embed-selected={selected ? 'true' : 'false'}
    >
      <div
        className={cn(
          'rounded-lg my-2 overflow-hidden',
          'border border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-database-embed-card=""
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-3 py-2',
            'border-b border-gray-200 dark:border-gray-700',
            'bg-gray-50 dark:bg-gray-800'
          )}
          data-drag-handle
          data-database-embed-header=""
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
                data-database-embed-control="view-type"
                onClick={() => setShowViewPicker(!showViewPicker)}
                onMouseDown={stopEditorMouseDown}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  'text-xs text-gray-600 dark:text-gray-400',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'transition-colors'
                )}
                aria-label="Change view type"
              >
                <span aria-hidden="true">
                  {VIEW_ICONS[viewType as DatabaseViewType] || VIEW_ICONS.table}
                </span>
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
                  data-database-embed-menu="view-type"
                >
                  {ALL_VIEWS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      data-database-embed-control={`view-type-${type}`}
                      onClick={() => {
                        updateAttributes({ viewType: type })
                        setShowViewPicker(false)
                      }}
                      onMouseDown={stopEditorMouseDown}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5',
                        'text-sm text-left',
                        'hover:bg-gray-100 dark:hover:bg-gray-700',
                        viewType === type &&
                          'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      )}
                    >
                      <span aria-hidden="true">{VIEW_ICONS[type]}</span>
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
            data-database-embed-control="open"
            onClick={() => {
              // Dispatch a custom event that the app can listen to
              window.dispatchEvent(
                new CustomEvent('xnet:open-database', { detail: { databaseId } })
              )
            }}
            onMouseDown={stopEditorMouseDown}
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
        <div
          className="overflow-auto"
          data-database-embed-content=""
          style={{ maxHeight: maxHeight || 400 }}
        >
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
