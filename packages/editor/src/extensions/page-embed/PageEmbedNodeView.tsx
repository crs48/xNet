/**
 * PageEmbedNodeView - selectable block card for embedded page references.
 */
import type { PageEmbedOptions } from './PageEmbedExtension'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { cn } from '../../utils'

function stopEditorMouseDown(event: React.MouseEvent<HTMLElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

function stopEditorSurfaceMouseDown(event: React.MouseEvent<HTMLElement>): void {
  event.stopPropagation()
}

function normalizeValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function createPageEmbedTarget(value: string): { pageId: string; title: string } | null {
  const title = normalizeValue(value)
  if (!title) return null

  return {
    pageId: title.includes('/') ? title : `default/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title
  }
}

function createPageIcon(title: string): string {
  const initials = title
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return initials || 'PG'
}

function PageEmbedSetupCard({
  selected,
  updateAttributes
}: {
  selected: boolean
  updateAttributes: NodeViewProps['updateAttributes']
}): JSX.Element {
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const applyPageEmbed = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const target = createPageEmbedTarget(value)
      if (!target) {
        setError('Enter a page title or ID')
        inputRef.current?.focus()
        return
      }

      updateAttributes({
        pageId: target.pageId,
        title: target.title,
        subtitle: 'Embedded page',
        icon: createPageIcon(target.title)
      })
    },
    [updateAttributes, value]
  )

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-page-embed-node=""
      data-page-embed-empty="true"
      data-page-embed-selected={selected ? 'true' : 'false'}
    >
      <form
        data-testid="page-embed-setup"
        className={cn(
          'my-3 rounded-lg border border-dashed bg-white p-3 shadow-sm transition-colors',
          'border-gray-300 dark:border-gray-700 dark:bg-gray-900',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        onMouseDown={stopEditorSurfaceMouseDown}
        onSubmit={applyPageEmbed}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Page embed</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Type a title or page ID
            </div>
          </div>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200"
          >
            PG
          </span>
        </div>
        <label htmlFor={inputId} className="sr-only">
          Page title or ID
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            value={value}
            placeholder="Page title or ID"
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
              setValue(event.target.value)
              setError(null)
            }}
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Create
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </NodeViewWrapper>
  )
}

export function PageEmbedNodeView({ node, selected, extension, updateAttributes }: NodeViewProps) {
  const pageId = normalizeValue(node.attrs.pageId)
  const title = normalizeValue(node.attrs.title) ?? pageId ?? 'Untitled page'
  const subtitle = normalizeValue(node.attrs.subtitle)
  const icon = normalizeValue(node.attrs.icon) ?? 'PG'
  const preview = normalizeValue(node.attrs.preview)
  const options = extension.options as PageEmbedOptions

  const handleOpen = React.useCallback(() => {
    if (!pageId) return
    options.onNavigate?.(pageId)
  }, [options, pageId])

  if (!pageId) {
    return <PageEmbedSetupCard selected={selected} updateAttributes={updateAttributes} />
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-page-embed-node=""
      data-page-embed-selected={selected ? 'true' : 'false'}
    >
      <article
        className={cn(
          'my-3 rounded-lg border bg-white p-3 shadow-sm transition-colors',
          'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600',
          selected && 'ring-2 ring-blue-500 ring-offset-2'
        )}
        data-drag-handle
        data-page-embed-card=""
        data-page-id={pageId ?? ''}
        onDoubleClick={handleOpen}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-xs font-semibold uppercase',
              'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200'
            )}
            aria-hidden="true"
          >
            {icon.slice(0, 4)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {subtitle ?? pageId ?? 'Page reference'}
                </div>
              </div>
              <button
                type="button"
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                  'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                  'dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                )}
                aria-label={`Open ${title}`}
                data-page-embed-control="open"
                onMouseDown={stopEditorMouseDown}
                onClick={handleOpen}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
            {preview ? (
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
                {preview}
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </NodeViewWrapper>
  )
}
