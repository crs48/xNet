/**
 * EmbedNodeView - React NodeView for media embeds (YouTube, Spotify, etc.).
 *
 * Features:
 * - Responsive iframe with aspect ratio preservation
 * - Provider badge overlay (icon + name)
 * - Open in new tab button
 * - Loading state
 */
import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { cn } from '../../utils'
import { EMBED_PROVIDERS, parseEmbedUrl, type EmbedProvider } from './providers'

/** Get provider config by name */
function getProvider(name: string): EmbedProvider | undefined {
  return EMBED_PROVIDERS.find((p) => p.name === name)
}

const ALIGNMENTS: Record<string, string> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto'
}

export function EmbedNodeView({
  node,
  selected,
  updateAttributes,
  deleteNode,
  editor,
  getPos
}: NodeViewProps) {
  const { url, provider: providerName, embedUrl, title, width, alignment } = node.attrs
  const [loading, setLoading] = React.useState(true)
  const [inputValue, setInputValue] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [resizeWidth, setResizeWidth] = React.useState<number | null>(null)
  const resizeWidthRef = React.useRef<number | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const provider = getProvider(providerName)

  const aspectRatio = provider?.aspectRatio || 16 / 9
  const paddingBottom = `${(1 / aspectRatio) * 100}%`
  const isResizing = resizeWidth !== null

  // Keep ref in sync with state
  React.useEffect(() => {
    resizeWidthRef.current = resizeWidth
  }, [resizeWidth])

  // Handle resize via mouse drag
  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startWidth = containerRef.current?.offsetWidth || width || 560
      const maxWidth = 1200

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta =
          direction === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX

        const newWidth = Math.max(280, Math.min(startWidth + delta * 2, maxWidth))
        setResizeWidth(newWidth)
        resizeWidthRef.current = newWidth
      }

      const handleMouseUp = () => {
        const finalWidth = resizeWidthRef.current
        if (finalWidth !== null) {
          updateAttributes({ width: finalWidth })
        }
        setResizeWidth(null)
        resizeWidthRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, updateAttributes]
  )

  // Focus input when node is created without URL
  React.useEffect(() => {
    if (!url && inputRef.current) {
      inputRef.current.focus()
    }
  }, [url])

  // Convert embed to plain link
  const handleConvertToLink = React.useCallback(() => {
    if (!url || typeof getPos !== 'function') return

    const pos = getPos()
    if (pos === undefined) return

    const linkText = title || provider?.displayName || url

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContent({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            marks: [{ type: 'link', attrs: { href: url } }],
            text: linkText
          }
        ]
      })
      .run()
  }, [url, title, provider, editor, getPos, node.nodeSize])

  const handleSubmit = () => {
    const trimmedUrl = inputValue.trim()
    if (!trimmedUrl) return

    // Try to parse the URL
    const parsed = parseEmbedUrl(trimmedUrl)

    if (!parsed) {
      setError('Unsupported URL. Try YouTube, Vimeo, Spotify, etc.')
      return
    }

    updateAttributes({
      url: trimmedUrl,
      provider: parsed.provider.name,
      embedId: parsed.id,
      embedUrl: parsed.embedUrl
    })
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      deleteNode()
    }
  }

  // No URL - show input field
  if (!url) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'flex flex-col gap-2 p-4 rounded-lg my-2',
            'bg-gray-50 dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700',
            selected && 'ring-2 ring-blue-500 ring-offset-2'
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔗</span>
            <input
              ref={inputRef}
              type="url"
              placeholder="Paste YouTube, Vimeo, Spotify URL..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!inputValue.trim()) {
                  deleteNode()
                }
              }}
              className={cn(
                'flex-1 px-3 py-2 text-sm rounded-md',
                'bg-white dark:bg-gray-700',
                'border border-gray-300 dark:border-gray-600',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                'placeholder:text-gray-400'
              )}
            />
            <button
              type="button"
              onClick={handleSubmit}
              className={cn(
                'px-3 py-2 text-sm font-medium rounded-md',
                'bg-blue-500 text-white',
                'hover:bg-blue-600 transition-colors'
              )}
            >
              Embed
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <p className="text-xs text-gray-500">
            Supports YouTube, Vimeo, Spotify, SoundCloud, Twitter, and more
          </p>
        </div>
      </NodeViewWrapper>
    )
  }

  // Has URL but failed to parse - show error state
  if (!embedUrl) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'flex items-center justify-center p-6 rounded-lg my-2',
            'bg-gray-50 dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700',
            'text-gray-500 dark:text-gray-400',
            selected && 'ring-2 ring-blue-500 ring-offset-2'
          )}
          data-drag-handle
        >
          <span className="text-sm">Unable to embed: {url}</span>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        ref={containerRef}
        className={cn(
          'relative rounded-lg my-2 group',
          selected && 'ring-2 ring-blue-500 ring-offset-2',
          ALIGNMENTS[alignment || 'left']
        )}
        style={{ width: isResizing ? resizeWidth : width || 400, maxWidth: '100%' }}
        data-drag-handle
      >
        {/* Responsive iframe container */}
        <div
          className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
          style={{ paddingBottom }}
        >
          {/* Loading state */}
          {loading && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-gray-100 dark:bg-gray-800'
              )}
            >
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 text-gray-400">
                  <svg
                    className="animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                </div>
                <p className="text-xs text-gray-500">
                  Loading {provider?.displayName || 'embed'}...
                </p>
              </div>
            </div>
          )}

          {/* Iframe */}
          <iframe
            src={embedUrl}
            title={title || `${provider?.displayName || 'Embedded'} content`}
            className="absolute inset-0 w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            onLoad={() => setLoading(false)}
          />
        </div>

        {/* Provider badge (top-left, visible on hover) */}
        {provider && (
          <div
            className={cn(
              'absolute top-2 left-2',
              'flex items-center gap-1.5 px-2 py-1',
              'bg-black/70 text-white rounded-md text-xs',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
              'pointer-events-none'
            )}
          >
            <span>{provider.icon}</span>
            <span>{provider.displayName}</span>
          </div>
        )}

        {/* Top-right buttons (visible on hover) */}
        {url && (
          <div
            className={cn(
              'absolute top-2 right-2',
              'flex items-center gap-1',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
            )}
          >
            {/* Convert to link button */}
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 px-2 py-1',
                'bg-black/70 text-white rounded-md text-xs',
                'hover:bg-black/90'
              )}
              aria-label="Convert to link"
              title="Convert to link"
              onClick={(e) => {
                e.stopPropagation()
                handleConvertToLink()
              }}
            >
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
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              <span>Link</span>
            </button>

            {/* Open in new tab button */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-1 px-2 py-1',
                'bg-black/70 text-white rounded-md text-xs',
                'hover:bg-black/90'
              )}
              aria-label="Open in new tab"
              title="Open in new tab"
              onClick={(e) => e.stopPropagation()}
            >
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
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              <span>Open</span>
            </a>
          </div>
        )}

        {/* Alignment toolbar (visible on hover) */}
        <div
          className={cn(
            'absolute -top-10 left-1/2 -translate-x-1/2',
            'flex items-center gap-1 p-1',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
            'border border-gray-200 dark:border-gray-700',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => updateAttributes({ alignment: align })}
              className={cn(
                'p-1.5 rounded',
                alignment === align
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              aria-label={`Align ${align}`}
              aria-pressed={alignment === align}
            >
              <AlignIcon type={align} />
            </button>
          ))}
        </div>

        {/* Resize handles (visible on hover) */}
        <>
          {/* Left handle */}
          <div
            className={cn(
              'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
              'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
            onMouseDown={(e) => {
              e.stopPropagation()
              handleResizeStart(e, 'left')
            }}
            draggable={false}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize embed left"
          />
          {/* Right handle */}
          <div
            className={cn(
              'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
              'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
            onMouseDown={(e) => {
              e.stopPropagation()
              handleResizeStart(e, 'right')
            }}
            draggable={false}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize embed right"
          />
        </>
      </div>
    </NodeViewWrapper>
  )
}

function AlignIcon({ type }: { type: 'left' | 'center' | 'right' }) {
  const paths: Record<string, string> = {
    left: 'M3 6h18M3 12h12M3 18h18',
    center: 'M3 6h18M6 12h12M3 18h18',
    right: 'M3 6h18M9 12h12M3 18h18'
  }

  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeWidth={2} d={paths[type]} />
    </svg>
  )
}
